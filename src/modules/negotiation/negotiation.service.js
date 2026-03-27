// This File Handles The Negotiation Business Logic
const NegotiationRepository = require("./negotiation.repository");
const OrderRepository = require("../order/order.repository");
const PartnerRepository = require("../partner/partner.repository");
const AnalyticsService = require("../analytics/analytics.service");
const NotificationService = require("../notification/notification.service");
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");
const { Conflict, NotFound } = require("../../core/errors/errors");
const logger = require("../../utils/logger");

class NegotiationService {
  // Calculate Surge Pricing Based On Scarcity (1-2 Drivers)
  async calculateSuggestedFare(pickupLng, pickupLat, distanceKm) {
    const baseRate = 120; // Example Base Fare In BDT
    const perKmRate = 45;

    // Find Drivers In 25 Kilometers Radius To Determine Surge
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

  // Initiate A New Negotiation Session (No Transactions — Compatible With All MongoDB Tiers)
  async initiate(userId, { orderId, driverId, version }) {
    // Atomically Lock Driver — Returns Null If Driver Is Busy
    const driverLock = await PartnerRepository.lockForNegotiation(driverId, 60000);
    if (!driverLock) {
      throw new Conflict("Driver Is Currently Busy Or In Another Negotiation!");
    }

    try {
      // Create Negotiation Session Document
      const negotiationSession = await NegotiationRepository.createSession({
        orderId,
        userId,
        driverId,
        messages: [],
        expiresAt: new Date(Date.now() + 29 * 60 * 1000), // 29 Minutes To Respond
      });

      // Link Negotiation To Order (With Occ Version Guard)
      const order = await OrderRepository.initiateNegotiation(orderId, negotiationSession._id, version);
      if (!order) {
        // Rollback: Unlock Driver And Remove Session If Order Link Fails
        await PartnerRepository.unlockFromNegotiation(driverId);
        await NegotiationRepository.updateStatus(negotiationSession._id.toString(), "rejected", { endedReason: "order_state_changed" });
        throw new Conflict("Unable To Start Negotiation — Order State Has Changed!");
      }

      // Trigger Dispatch Delivery Via New Event Engine (Replaces Manual Socket Emit)
      await NotificationService.trigger({
        orderId,
        type: "NEGOTIATION_REQ",
        recipientId: driverId,
        actorId: userId,
        priority: "HIGH",
        channels: ["push", "in_app", "store"],
        data: {
          sessionId: negotiationSession._id,
          userId,
          orderId
        }
      });

      return negotiationSession;
    } catch (err) {
      // Safety Net: Ensure Driver Is Never Left Permanently Locked
      if (!(err instanceof Conflict)) {
        await PartnerRepository.unlockFromNegotiation(driverId).catch(() => { });
      }
      throw err;
    }
  }

  // Complete Negotiation: Agreement Reached And Analytics Recorded (No Transactions)
  async completeNegotiation(sessionId, orderId) {
    const negotiation = await NegotiationRepository.findById(sessionId);
    if (!negotiation || negotiation.status !== "active") {
      throw new Conflict("Negotiation Session Inactive Or Already Closed!");
    }

    // Derive Critical Values From Message History
    const roundCount = negotiation.messages.length;
    const finalPrice = negotiation.messages[roundCount - 1]?.amount;

    // Update Order Status (Guarded By Occ)
    const updatedOrder = await OrderRepository.updateStatusWithGuard(orderId, negotiation.driverId, "negotiating", "accepted", {
      partnerId: new ObjectId(negotiation.driverId),
      acceptedAt: new Date(),
      finalFare: finalPrice
    });

    if (!updatedOrder) {
      throw new Conflict("Double-booking Collision Or State Mismatch Detected!");
    }

    // Bind Driver To Operational Trip
    await PartnerRepository.lockDriver(negotiation.driverId, orderId);

    // Close Negotiation Session
    await NegotiationRepository.updateStatus(sessionId, "accepted", { endedReason: "agreement_reached" });

    // Trigger Acceptance Notifications For Both Parties (Sync Handshake)
    await NotificationService.trigger({
      orderId, type: "USER_ACCEPTED", recipientId: negotiation.driverId, actorId: negotiation.userId,
      priority: "HIGH", channels: ["push", "in_app", "store"], data: { orderId, finalPrice }
    });

    await NotificationService.trigger({
      orderId, type: "DRIVER_ACCEPTED", recipientId: negotiation.userId, actorId: negotiation.driverId,
      priority: "HIGH", channels: ["push", "in_app", "store"], data: { orderId, finalPrice }
    });

    // Log Analytics Asynchronously (Non-Critical — Does Not Block Flow)
    const order = await OrderRepository.findById(orderId);
    AnalyticsService.logNegotiationEvent(
      orderId,
      sessionId,
      negotiation.driverId,
      roundCount,
      "accepted",
      finalPrice,
      order?.fareEstimate
    ).catch(err => logger.warn({ err }, "Analytics Log Failed (Non-Critical)."));

    return { orderId, finalPrice };
  }

  // Handle Negotiation Termination (Failure / Reject / Expire) With Analytics (No Transactions)
  async failNegotiation(sessionId, reason) {
    const negotiation = await NegotiationRepository.findById(sessionId);
    if (!negotiation || negotiation.status !== "active") return;

    // Mark Session As Ended
    const outcome = reason === "no_response_timeout" ? "expired_timeout" : "rejected";
    await NegotiationRepository.updateStatus(sessionId, outcome, { endedReason: reason });

    // Trigger Rejection Notifications (Only If Manually Rejected, Not For Worker Timeouts)
    if (reason !== "no_response_timeout") {
      await NotificationService.trigger({
        orderId: negotiation.orderId, type: "USER_REJECTED", recipientId: negotiation.driverId, actorId: negotiation.userId,
        priority: "MEDIUM", channels: ["in_app", "store"], data: { orderId: negotiation.orderId, reason }
      });

      await NotificationService.trigger({
        orderId: negotiation.orderId, type: "DRIVER_REJECT_ORD", recipientId: negotiation.userId, actorId: negotiation.driverId,
        priority: "MEDIUM", channels: ["push", "in_app", "store"], data: { orderId: negotiation.orderId, reason }
      });
    }

    // Clear Driver Lock
    await PartnerRepository.unlockFromNegotiation(negotiation.driverId);

    // Reset Order State And Record Attempt
    await OrderRepository.recordNegotiationAttempt(negotiation.orderId, negotiation.driverId);

    // Log Analytics Asynchronously (Non-Critical)
    AnalyticsService.logNegotiationEvent(
      negotiation.orderId,
      sessionId,
      negotiation.driverId,
      negotiation.messages.length,
      outcome
    ).catch(err => logger.warn({ err }, "Analytics Log Failed (Non-Critical)."));

    return { orderId: negotiation.orderId, userId: negotiation.userId, driverId: negotiation.driverId };
  }

  // Retrieve Full Bidding Transcript For Auditing (Admins)
  async getHistory(orderId) {
    // Try Finding Active Session First
    let session = await NegotiationRepository.findActiveByOrderId(orderId);

    // If Not Active, Look Up The Order Historical Archive
    if (!session) {
      const order = await OrderRepository.findById(orderId);
      if (order && order.negotiationHistory && order.negotiationHistory.length > 0) {
        // Get The Latest Negotiation Attached To This Order
        const lastSessionId = order.negotiationHistory[order.negotiationHistory.length - 1];
        session = await NegotiationRepository.findById(lastSessionId);
      }
    }

    if (!session) {
      throw new NotFound("No Bidding Cycle Found For This Order!");
    }
    return session;
  }
}

module.exports = new NegotiationService();
