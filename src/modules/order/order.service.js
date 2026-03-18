const OrderRepository = require("./order.repository");
const PartnerRepository = require("../partner/partner.repository");
const AnalyticsService = require("../analytics/analytics.service");
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");
const { BadRequest, Conflict, NotFound } = require("../../core/errors/errors");
const logger = require("../../utils/logger");

// In-memory Registry: Orderid -> Set Of Dispatched Driverids In Current Batch
const dispatchRegistry = new Map();
// In-memory Registry: Orderid -> Global Expiry Settimeout Handle
const expiryTimers = new Map();
// In-memory Registry: Orderid -> Promise Resolver For Waitforacceptance()
const acceptanceResolvers = new Map();

class OrderService {
  // Manual Discovery Phase: Find Nearby Drivers & Aggregated Surge Data
  async fetchNearbyForDiscovery(pickupLng, pickupLat) {
    const NegotiationService = require("../negotiation/negotiation.service");
    
    // 1. Calculate Surge Meta-data (Scarcity-based)
    const pricingMetadata = await NegotiationService.calculateSuggestedFare(pickupLng, pickupLat, 10); // Approx 10km Trip

    // 2. Aggregation: Find Online & Available Partners (Spherical Geometry)
    const collection = await getCollection("partners");
    const drivers = await collection.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)] },
          distanceField: "dist.calculated",
          query: { isOnline: true, currentOrderId: null, isAvailable: true, isNegotiating: { $ne: true } },
          spherical: true,
        },
      },
      { $limit: 9 }, // Top 9 Closest Drivers (Unlimited Radius)
      { $project: { _id: 1, name: 1, ambulanceType: 1, vehicleNumber: 1, "dist.calculated": 1 } }
    ]).toArray();

    return { pricingMetadata, drivers };
  }
  // Create A New Order In Pending State For User Discovery
  async createOrder(userId, { pickupLng, pickupLat, destinationLng, destinationLat, notes }) {
    if (!pickupLng || !pickupLat || !destinationLng || !destinationLat) {
      throw new BadRequest("Pickup And Destination Coordinates Are Required!");
    }

    // Check For Active Order Conflict (Including Negotiating)
    const existingOrder = await OrderRepository.findActiveByUserId(userId);
    if (existingOrder) {
      throw new Conflict("You Already Have An Active Order!");
    }

    // Create The Pending Order
    const order = await OrderRepository.createOrder({
      userId: new ObjectId(userId),
      partnerId: null,
      status: "pending",
      pickupLocation: { type: "Point", coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)] },
      destinationLocation: { type: "Point", coordinates: [parseFloat(destinationLng), parseFloat(destinationLat)] },
      driverLocation: null,
      notes: notes || null,
      fareEstimate: null,
      acceptedAt: null,
      pickupStartedAt: null,
      completedAt: null,
      cancelledAt: null,
      otp: {
        code: Math.floor(1000 + Math.random() * 9000).toString(), // Secure 4-Digit Otp
        verified: false,
      },
      penaltyFlag: false, // Tracks Business Violations (e.g. Cancel Post-Otp)
    });

    return order;
  }

  // Fetch Nearby Drivers With Scarcity-Based Surge Pricing Information
  async fetchNearbyForDiscovery(pickupLng, pickupLat) {
    const negotiationService = require("../negotiation/negotiation.service");
    
    // Find Nearby Drivers Who Are Online AND Available
    const collection = await getCollection("partners");
    const drivers = await collection
      .find({
        location: {
          $nearSphere: {
            $geometry: { type: "Point", coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)] },
            $maxDistance: 10000,
          },
        },
        isOnline: true,
        currentOrderId: null,
        // Include "isNegotiating" Drivers As "Likely Unavailable" But Don't Hide Them!
      })
      .limit(10)
      .toArray();

    // Calculate Dynamic Surge For The Batch
    const pricing = await negotiationService.calculateSuggestedFare(pickupLng, pickupLat, 5); // Example: 5Km Default Estimate

    return {
      drivers: drivers.map(d => ({
        id: d.userId,
        location: d.location,
        isLikelyUnavailable: d.isNegotiating === true, // UX Hint
        lastSeen: d.lastLocationUpdate,
        vehicleType: d.vehicleType || "Basic Ambulance"
      })),
      pricingMetadata: pricing
    };
  }

  // User Or Driver Cancels An Order (Supports Granular Penalty Logic)
  async cancelOrder(orderId, userId, cancelBy = "user") {
    const order = await OrderRepository.findById(orderId);
    if (!order) throw new NotFound("Order Not Found!");

    // Security Verification: Can Only Be Status Changed By Participant
    const isUser = order.userId.toString() === userId;
    const isDriver = order.partnerId && order.partnerId.toString() === userId;
    if (!isUser && !isDriver) throw new BadRequest("Unauthorized To Cancel This Order!");

    // Forbidden If Already Completed
    if (["completed", "cancelled_by_user", "cancelled_by_driver"].includes(order.status)) {
      throw new BadRequest("Order Is Already Finalized!");
    }

    // Penalty Logic: Mid-Trip Cancellations (After Pickup Or In-Transport)
    const isMidTrip = ["to_destination", "pickup_started", "arrived"].includes(order.status);
    const penaltyApplied = isDriver && isMidTrip;

    const newStatus = cancelBy === "user" ? "cancelled_by_user" : "cancelled_by_driver";
    
    await OrderRepository.updateStatus(orderId, newStatus, { 
      cancelledAt: new Date(),
      cancelledBy: cancelBy,
      penaltyFlag: penaltyApplied
    });

    // Log Penalty To Dedicated Tracking Layer
    if (penaltyApplied) {
      await AnalyticsService.logDriverPenalty(order.partnerId.toString(), orderId, "mid_trip_cancellation");
    }

    // Unlock Driver Completely
    if (order.partnerId) {
      await PartnerRepository.unlockDriver(order.partnerId.toString());
      const socketService = require("../../core/socket");
      socketService.io.to("driver_" + order.partnerId.toString()).emit("order_cancelled", { orderId, by: cancelBy });
      socketService.sendToUser(order.userId.toString(), "order_cancelled", { orderId, by: cancelBy });
    }

    return { 
      message: `Order Cancelled By ${cancelBy.toUpperCase()}!`, 
      penaltyFlag: penaltyApplied 
    };
  }

  // Driver Arrives — Still Locked By Partner Id
  async markArrived(orderId, partnerId) {
    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, "accepted", "arrived");
    if (!updated) throw new BadRequest("Invalid State Or Access Denied!");

    const socketService = require("../../core/socket");
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "arrived" });
    return updated;
  }

  // Trip Start — Mandatory OTP Verification
  async startTripWithOTP(orderId, partnerId, userEnteredOtp) {
    const order = await OrderRepository.findById(orderId);

    if (!order || order.status !== "arrived" || order.partnerId.toString() !== partnerId.toString()) {
      throw new BadRequest("Only Assigned Driver Can Start Trip Post-Arrival!");
    }

    // Atomic OTP Verification
    if (order.otp.code !== userEnteredOtp) {
      throw new BadRequest("Invalid Verification Code! Trip Cannot Start.");
    }

    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, "arrived", "pickup_started", {
      "otp.verified": true,
      pickupStartedAt: new Date(),
    });

    const socketService = require("../../core/socket");
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "pickup_started" });
    return updated;
  }

  // Transition To En-Route Full Perspective
  async beginTransport(orderId, partnerId) {
    return OrderRepository.updateStatusWithGuard(orderId, partnerId, "pickup_started", "to_destination");
  }

  // Final Completion — Driver Payout Ready
  async finishTrip(orderId, partnerId) {
    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, ["to_destination", "pickup_started"], "completed", {
      completedAt: new Date(),
    });
    if (!updated) throw new BadRequest("Invalid Trip State For Completion!");

    await PartnerRepository.unlockDriver(partnerId);
    const socketService = require("../../core/socket");
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "completed" });
    return updated;
  }

  // Get Active Order Support For Current Session Sync
  async getActiveOrder(userId) {
    return OrderRepository.findActiveByUserId(userId);
  }

  async getOrderHistory(userId) {
    return OrderRepository.findHistoryByUserId(userId);
  }

  async getActiveOrderByPartner(partnerId) {
    return OrderRepository.findActiveByPartnerId(partnerId);
  }

  async getOrderHistoryByPartner(partnerId) {
    return OrderRepository.findHistoryByPartnerId(partnerId);
  }
}

module.exports = new OrderService();
