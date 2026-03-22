const OrderRepository = require("./order.repository");
const PartnerRepository = require("../partner/partner.repository");
const AnalyticsService = require("../analytics/analytics.service");
const NegotiationService = require("../negotiation/negotiation.service");
const UserRepository = require("../user/user.repository");
const NegotiationRepository = require("../negotiation/negotiation.repository");
const socketService = require("../../core/socket");
const { getCollection, client } = require("../../config/db");
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
  async fetchNearbyForDiscovery(pickupLng, pickupLat, userId) {
    // Ensure Numeric Coordinates For Precision Matching
    const lng = parseFloat(pickupLng);
    const lat = parseFloat(pickupLat);

    // 1. Calculate Surge Meta-data (Scarcity-based)
    const pricingMetadata = await NegotiationService.calculateSuggestedFare(lng, lat, 25); // Approx 25km Trip

    // 2. Identify Blocked Drivers (1-minute Cooldown For Re-discovery)
    const activeOrder = await OrderRepository.findActiveByUserId(userId);
    let blockedDriverIds = [];

    if (activeOrder && activeOrder.attemptedDrivers) {
      const COOLDOWN_MS = 1 * 60 * 1000; // 1 Minute
      const cutoff = new Date(Date.now() - COOLDOWN_MS);
      blockedDriverIds = activeOrder.attemptedDrivers
        .filter(d => new Date(d.lastTriedAt) > cutoff)
        .map(d => new ObjectId(d.driverId));
    }

    // 3. Discovery Pipeline Factory (GeoNear + Match Filters)
    const buildDiscoveryPipeline = (excludeIds = []) => {
      const pipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lng, lat] },
            distanceField: "dist.calculated",
            spherical: true,
          },
        },
        {
          $match: {
            $or: [
              { isOnline: true },
              {
                isAppInBackground: true,
                lastAppHeartbeatAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) } // 5 Minute Grace Period
              }
            ],
            currentOrderId: null,
            isAvailable: true,
            isNegotiating: { $ne: true },
            isVerified: { $ne: false }, // Allow True Or Inherited True From Creation
            ...(excludeIds.length > 0 ? { _id: { $nin: excludeIds } } : {})
          }
        },
        { $limit: 10 },
        {
          $lookup: {
            from: "orders",
            let: { partner_uid: { $toString: "$userId" } },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: [{ $toString: "$partnerId" }, "$$partner_uid"] }, { $eq: ["$status", "completed"] }] } } },
              { $project: { _id: 1 } }
            ],
            as: "completedTrips"
          }
        },
        {
          $addFields: {
            completedOrderCount: { $size: "$completedTrips" },
            rating: { $ifNull: ["$rating", 0] }
          }
        },
        { $project: { _id: 1, name: 1, ambulanceType: 1, vehicleNumber: 1, completedOrderCount: 1, rating: 1, "dist.calculated": 1 } }
      ];
      return pipeline;
    };

    const collection = await getCollection("partners");

    // 4. Step A: Filtered Discovery (Respect Cooldown)
    let drivers = await collection.aggregate(buildDiscoveryPipeline(blockedDriverIds)).toArray();

    // 5. Step B: Fallback Discovery (Ignore Cooldown If Empty Results To Maintain Ux)
    if (drivers.length === 0) {
      drivers = await collection.aggregate(buildDiscoveryPipeline([])).toArray();
    }

    return { pricingMetadata, drivers };
  }

  // Create A New Order In Pending State For User Discovery
  async createOrder(userId, { pickupLng, pickupLat, destinationLng, destinationLat, notes, fareEstimate, partnerId, ambulanceType }) {
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
      partnerId: partnerId ? new ObjectId(partnerId) : null,
      status: "pending",
      pickupLocation: { type: "Point", coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)] },
      destinationLocation: { type: "Point", coordinates: [parseFloat(destinationLng), parseFloat(destinationLat)] },
      driverLocation: null,
      notes: notes || null,
      fareEstimate: fareEstimate ? parseFloat(fareEstimate) : null,
      ambulanceType: ambulanceType || null,
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

  // User Or Driver Cancels An Order (Supports Granular Penalty Logic)
  async cancelOrder(orderId, userId, cancelBy = "user") {
    const dbSession = client.startSession();
    try {
      let result = null;

      await dbSession.withTransaction(async () => {
        const order = await OrderRepository.findById(orderId);
        if (!order) throw new NotFound("Order Not Found!");

        // Security Verification: Can Only Be Status Changed By Participant
        const normalizedUserId = userId.toString();
        const isUser = order.userId.toString() === normalizedUserId;
        const isDriver = order.partnerId && order.partnerId.toString() === normalizedUserId;
        if (!isUser && !isDriver) throw new BadRequest("Unauthorized To Cancel This Order!");

        // Forbidden If Already Completed
        if (["completed", "cancelled_by_user", "cancelled_by_driver"].includes(order.status)) {
          throw new BadRequest("Order Is Already Finalized!");
        }

        // Penalty Logic: Mid-trip Cancellations (after Pickup Or In-transport)
        const isMidTrip = ["to_destination", "pickup_started", "arrived"].includes(order.status);
        const penaltyApplied = isDriver && isMidTrip;

        const newStatus = cancelBy === "user" ? "cancelled_by_user" : "cancelled_by_driver";

        await OrderRepository.updateStatus(orderId, newStatus, {
          cancelledAt: new Date(),
          cancelledBy: cancelBy,
          penaltyFlag: penaltyApplied
        }, { session: dbSession });

        // Log Penalty To Dedicated Tracking Layer
        if (penaltyApplied) {
          await AnalyticsService.logDriverPenalty(order.partnerId.toString(), orderId, "mid_trip_cancellation");
        }

        // Unlock Driver Completely
        const driverToUnlock = order.partnerId ? order.partnerId.toString() : (cancelBy === "driver" ? normalizedUserId : null);

        if (driverToUnlock) {
          await PartnerRepository.unlockDriver(driverToUnlock, { session: dbSession });
          socketService.io.to("driver_" + driverToUnlock).emit("order_cancelled", { orderId, by: cancelBy });
          socketService.sendToUser(order.userId.toString(), "order_cancelled", { orderId, by: cancelBy });
        }

        result = {
          message: `Order Cancelled By ${cancelBy.toUpperCase()}!`,
          penaltyFlag: penaltyApplied
        };
      });

      return result;
    } finally {
      await dbSession.endSession();
    }
  }

  // Get Detailed Information For A Single Order (Includes Non-sensitive User Profile)
  async getOrderDetails(orderId, requestUserId, requestUserRole) {
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      throw new NotFound("Order Not Found!");
    }

    // Role-based Access Control Registry (Stringify Ids For Strict Comparison)
    const normalizedReqId = requestUserId.toString();
    const isUser = order.userId.toString() === normalizedReqId;
    const isDriver = order.partnerId && order.partnerId.toString() === normalizedReqId;
    const isAdmin = requestUserRole === "admin";

    // Access Extension: Allow Drivers Who Are In An Active Negotiation Session For This Order
    let isNegotiator = false;
    if (order.status === "negotiating" && order.negotiationId) {
      const session = await NegotiationRepository.findById(order.negotiationId);
      if (session && session.driverId.toString() === normalizedReqId) {
        isNegotiator = true;
      }
    }

    // Shield Data From Non-participants
    if (!isUser && !isDriver && !isAdmin && !isNegotiator) {
      throw new BadRequest("Access Denied: You Are Not A Participant Of This Order.");
    }

    // Join Limited User Profile (Safety: Name Only Before Trip Accepted)
    const user = await UserRepository.findById(order.userId);

    // Join Partner Details If Assigned (Transparency Post-acceptance)
    let partner = null;
    if (order.partnerId && ["accepted", "arrived", "pickup_started", "to_destination", "completed"].includes(order.status)) {
      const partnerData = await PartnerRepository.findByUserId(order.partnerId.toString());
      const driverUser = await UserRepository.findById(order.partnerId.toString());

      if (partnerData && driverUser) {
        const completedCount = await OrderRepository.countCompletedByPartnerId(order.partnerId.toString());
        partner = {
          ...partnerData,
          name: driverUser.name,
          firstName: driverUser.firstName,
          lastName: driverUser.lastName,
          phone: driverUser.phone,
          completedOrderCount: completedCount
        };
      }
    }

    const result = {
      ...order,
      user: user ? { name: user.name, firstName: user.firstName, lastName: user.lastName } : null,
      partner: partner || null
    };

    return result;
  }

  // Driver Arrives — Notify User With Secure Otp Proactively
  async markArrived(orderId, partnerId) {
    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, "accepted", "arrived");
    if (!updated) throw new BadRequest("Invalid State Or Access Denied!");

    // Fetch Full Record To Extract User Id And Otp For Notification
    const order = await OrderRepository.findById(orderId);

    // Broadcast Status Update To Trip Room
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "arrived" });

    // Proactively Push Specific Arrival Notification To User (with Otp)
    socketService.sendToUser(order.userId.toString(), "driver_arrived", {
      message: "Your Driver Has Arrived! Provide The OTP To Start Trip Safely.",
      otp: order.otp.code,
      orderId: order._id
    });

    return updated;
  }

  // Trip Start — Mandatory Otp Verification
  async startTripWithOTP(orderId, partnerId, userEnteredOtp) {
    const order = await OrderRepository.findById(orderId);

    if (!order || order.status !== "arrived" || order.partnerId.toString() !== partnerId.toString()) {
      throw new BadRequest("Only Assigned Driver Can Start Trip Post-Arrival!");
    }

    // Atomic Otp Verification
    if (order.otp.code !== userEnteredOtp) {
      throw new BadRequest("Invalid Verification Code! Trip Cannot Start.");
    }

    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, "arrived", "pickup_started", {
      "otp.verified": true,
      pickupStartedAt: new Date(),
    });

    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "pickup_started" });
    return updated;
  }

  // Transition To En-route Full Perspective
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
    await PartnerRepository.incrementTrips(partnerId); // Synchronize Static Trip Counter

    // Broadcast Status Update To Trip Room
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "completed" });

    // Trigger Feedback Handshake For User
    const order = await OrderRepository.findById(orderId);
    socketService.sendToUser(order.userId.toString(), "ready_for_feedback", {
      message: "Trip Completed! Please Share Your Feedback To Help Us Improve.",
      orderId: order._id,
      partnerId: order.partnerId
    });

    return updated;
  }

  // Get Active Order Support For Current Session Sync (Includes Populated Driver Details)
  async getActiveOrder(userId) {
    const activeOrder = await OrderRepository.findActiveByUserId(userId);
    if (!activeOrder) return null;
    return this.getOrderDetails(activeOrder._id, userId, "user");
  }

  async getOrderHistory(userId, status) {
    return OrderRepository.findHistoryByUserId(userId, status);
  }

  async getActiveOrderByPartner(partnerId) {
    return OrderRepository.findActiveByPartnerId(partnerId);
  }

  // Get Past Trip History For Driver (Includes Populated User/Patient Details)
  async getOrderHistoryByPartner(partnerId, status) {
    const orders = await OrderRepository.findHistoryByPartnerId(partnerId, status);

    // Map Over Orders To Inject Limited User Profile Data For The History View
    return Promise.all(orders.map(async (order) => {
      const user = await UserRepository.findById(order.userId.toString());
      return {
        ...order,
        user: user ? { name: user.name, firstName: user.firstName, lastName: user.lastName, phone: user.phone } : null
      };
    }));
  }
}

module.exports = new OrderService();
