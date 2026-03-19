// This File Handles The Negotiation Business Logic
const NegotiationRepository = require("./negotiation.repository");
const OrderRepository = require("../order/order.repository");
const PartnerRepository = require("../partner/partner.repository");
const AnalyticsService = require("../analytics/analytics.service");
const { getCollection, client } = require("../../config/db");
const { Conflict } = require("../../core/errors/errors");
const logger = require("../../utils/logger");

class NegotiationService {
  // Calculate Surge Pricing Based On Scarcity (1-2 Drivers)
  async calculateSuggestedFare(pickupLng, pickupLat, distanceKm) {
    const baseRate = 120; // Example Base Fare In BDT
    const perKmRate = 45;
    
    // Find Drivers In 25km Radius To Determine Surge
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
  async initiate(userId, { orderId, driverId, version }) {
    const session = client.startSession();
    try {
      let negotiationSession = null;
      
      await session.withTransaction(async () => {
        // 1. Lock Driver Atomically
        const driverLock = await PartnerRepository.lockForNegotiation(driverId, 60000, { session });
        if (!driverLock) {
          throw new Conflict("Driver Is Currently Busy Or In Another Negotiation!");
        }

        // 2. Create Negotiation Session Document
        negotiationSession = await NegotiationRepository.createSession({
          orderId,
          userId,
          driverId,
          messages: [],
          expiresAt: new Date(Date.now() + 60000), // 60s To Respond
        }, { session });

        // 3. Atomically Link Negotiation To Order
        const order = await OrderRepository.initiateNegotiation(orderId, negotiationSession._id, version, { session });
        if (!order) {
          throw new Conflict("Unable To Start Negotiation — Order State Has Changed!");
        }
      });

      return negotiationSession;
    } finally {
      await session.endSession();
    }
  }

  // Transactional Completion: Agreement Reached & Analytics Recorded
  async completeNegotiation(sessionId, orderId) {
    const dbSession = client.startSession();
    try {
      let result = null;
      
      await dbSession.withTransaction(async () => {
        const negotiation = await NegotiationRepository.findById(sessionId);
        if (!negotiation || negotiation.status !== "active") {
          throw new Conflict("Negotiation Session Inactive Or Already Closed!");
        }

        // 1. Derive Critical Values (Truth From Message History)
        const roundCount = negotiation.messages.length;
        const finalPrice = negotiation.messages[roundCount - 1].amount;

        // 2. Transactional Order Status Update (Guarded By OCC)
        const updatedOrder = await OrderRepository.updateStatusWithGuard(orderId, negotiation.driverId, "negotiating", "accepted", {
          partnerId: new (require("mongodb")).ObjectId(negotiation.driverId),
          acceptedAt: new Date(),
          finalFare: finalPrice
        }, { session: dbSession });

        if (!updatedOrder) {
          throw new Conflict("Double-booking Collision Or State Mismatch Detected!");
        }

        // 3. System Lock: Bind Driver To The Operational Trip
        await PartnerRepository.lockDriver(negotiation.driverId, orderId, { session: dbSession });

        // 4. Close Session Documentation
        await NegotiationRepository.updateStatus(sessionId, "accepted", { endedReason: "agreement_reached" }, { session: dbSession });

        // 5. Terminal Analytics Log (Single Source Of Truth)
        const order = await OrderRepository.findById(orderId);
        await AnalyticsService.logNegotiationEvent(
          orderId,
          sessionId,
          negotiation.driverId,
          roundCount,
          "accepted",
          finalPrice,
          order?.fareEstimate // Baseline Delta
        );

        result = { orderId, finalPrice };
      });

      return result;
    } finally {
      await dbSession.endSession();
    }
  }

  // Handle Negotiation Termination (Failure/Reject/Expire) With Analytics
  async failNegotiation(sessionId, reason) {
    const dbSession = client.startSession();
    try {
      let result = null;

      await dbSession.withTransaction(async () => {
        const negotiation = await NegotiationRepository.findById(sessionId);
        if (!negotiation || negotiation.status !== "active") return;

        // 1. Mark Session As Ended (Rejected/Expired)
        const outcome = reason === "no_response_timeout" ? "expired_timeout" : "rejected";
        await NegotiationRepository.updateStatus(sessionId, outcome, { endedReason: reason }, { session: dbSession });

        // 2. Clear Driver Lock
        await PartnerRepository.unlockFromNegotiation(negotiation.driverId, { session: dbSession });

        // 3. Reset Order State & Record Attempt To Cooldown
        await OrderRepository.recordNegotiationAttempt(negotiation.orderId, negotiation.driverId, { session: dbSession });

        // Terminal Analytics Log (Single Source Of Truth)
        await AnalyticsService.logNegotiationEvent(
          negotiation.orderId, 
          sessionId, 
          negotiation.driverId, 
          negotiation.messages.length, // Derived Round Count
          outcome
        );
        
        result = { orderId: negotiation.orderId, userId: negotiation.userId, driverId: negotiation.driverId };
      });

      return result;
    } finally {
      await dbSession.endSession();
    }
  }
}

module.exports = new NegotiationService();
