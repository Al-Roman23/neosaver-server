// This File Handles The Negotiation Business Logic
const NegotiationRepository = require("./negotiation.repository");
const OrderRepository = require("../order/order.repository");
const PartnerRepository = require("../partner/partner.repository");
const AnalyticsService = require("../analytics/analytics.service");
const { getCollection } = require("../../config/db");
const { Conflict } = require("../../core/errors/errors");
const logger = require("../../utils/logger");

class NegotiationService {
  // Calculate Surge Pricing Based On Scarcity (1-2 Drivers)
  async calculateSuggestedFare(pickupLng, pickupLat, distanceKm) {
    const baseRate = 120; // Example Base Fare In BDT
    const perKmRate = 45;
    
    // Find Drivers In 10km Radius To Determine Surge
    const collection = await getCollection("partners");
    const driverCount = await collection.countDocuments({
      location: {
        $geoWithin: {
          $centerSphere: [[parseFloat(pickupLng), parseFloat(pickupLat)], 25 / 6378.1],
        },
      },
      isOnline: true,
      currentOrderId: null,
      isAvailable: true,
      isNegotiating: { $ne: true },
    });

    let surgeMultiplier = 1.0;
    if (driverCount > 0 && driverCount <= 2) {
      surgeMultiplier = 1.5; // High Scarcity Surge
    } else if (driverCount === 0) {
      surgeMultiplier = 2.0; // Extreme Scarcity Surge
    }

    const estimatedFare = Math.round((baseRate + (distanceKm * perKmRate)) * surgeMultiplier);
    
    return {
      estimatedFare,
      surgeApplied: surgeMultiplier > 1.0,
      nearbyDrivers: driverCount,
      minAcceptable: Math.round(estimatedFare * 0.9),
      maxSuggested: Math.round(estimatedFare * 1.3)
    };
  }

  // Initiate A New Negotiation Session With Analytics Handshake
  async initiate(userId, { orderId, driverId, initialAmount, version }) {
    // 1. Lock Driver Atomically
    const driverLock = await PartnerRepository.lockForNegotiation(driverId);
    if (!driverLock) {
      throw new Conflict("Driver Is Currently Busy Or In Another Negotiation!");
    }

    try {
      // 2. Create Negotiation Session Document
      const session = await NegotiationRepository.createSession({
        orderId,
        userId,
        driverId,
        messages: [{ sender: "user", amount: initialAmount, timestamp: new Date() }],
        expiresAt: new Date(Date.now() + 60000), // 60s To Respond
      });

      // 3. Atomically Link Negotiation To Order
      const order = await OrderRepository.initiateNegotiation(orderId, session._id, version);
      if (!order) {
        await PartnerRepository.unlockFromNegotiation(driverId);
        throw new Conflict("Unable To Start Negotiation — Order State Has Changed!");
      }

      // Clean Handshake: Negotiation Session Created Successfully
      return session;
    } catch (error) {
      await PartnerRepository.unlockFromNegotiation(driverId);
      throw error;
    }
  }

  // Transactional Completion: Agreement Reached & Analytics Recorded
  async completeNegotiation(sessionId, orderId) {
    const session = await NegotiationRepository.findById(sessionId);
    if (!session || session.status !== "active") {
       throw new Conflict("Negotiation Session Inactive Or Already Closed!");
    }

    // 1. Derive Critical Values (Truth From Message History)
    const roundCount = session.messages.length;
    const finalPrice = session.messages[roundCount - 1].amount;

    // 2. Transactional Order Status Update (Guarded By OCC)
    const updatedOrder = await OrderRepository.updateStatusWithGuard(orderId, session.driverId, "negotiating", "accepted", {
      partnerId: new (require("mongodb")).ObjectId(session.driverId),
      acceptedAt: new Date(),
      finalFare: finalPrice
    });

    if (!updatedOrder) {
      throw new Conflict("Double-booking Collision Or State Mismatch Detected!");
    }

    // 3. System Lock: Bind Driver To The Operational Trip
    await PartnerRepository.lockDriver(session.driverId, orderId);

    // 4. Close Session Documentation
    await NegotiationRepository.updateStatus(sessionId, "accepted", { endedReason: "agreement_reached" });

    // 5. Terminal Analytics Log (Single Source Of Truth)
    await AnalyticsService.logNegotiationEvent(
      orderId,
      sessionId,
      session.driverId,
      roundCount,
      "accepted",
      finalPrice
    );

    return { orderId, finalPrice };
  }

  // Handle Negotiation Termination (Failure/Reject/Expire) With Analytics
  async failNegotiation(sessionId, reason) {
    const session = await NegotiationRepository.findById(sessionId);
    if (!session || session.status !== "active") return;

    // 1. Mark Session As Ended (Rejected/Expired)
    const outcome = reason === "no_response_timeout" ? "expired_timeout" : "rejected";
    await NegotiationRepository.updateStatus(sessionId, outcome, { endedReason: reason });

    // 2. Clear Driver Lock
    await PartnerRepository.unlockFromNegotiation(session.driverId);

    // 3. Reset Order State & Record Attempt To Cooldown
    await OrderRepository.recordNegotiationAttempt(session.orderId, session.driverId);

    // Terminal Analytics Log (Single Source Of Truth)
    await AnalyticsService.logNegotiationEvent(
      session.orderId, 
      sessionId, 
      session.driverId, 
      session.messages.length, // Derived Round Count
      outcome
    );
    
    return { orderId: session.orderId, userId: session.userId, driverId: session.driverId };
  }
}

module.exports = new NegotiationService();
