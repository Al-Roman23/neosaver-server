const OrderRepository = require("./order.repository");
const PartnerRepository = require("../partner/partner.repository");
const AnalyticsService = require("../analytics/analytics.service");
const NegotiationService = require("../negotiation/negotiation.service");
const UserRepository = require("../user/user.repository");
const NegotiationRepository = require("../negotiation/negotiation.repository");
const socketService = require("../../core/socket");
const NotificationService = require("../notification/notification.service");
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");
const { BadRequest, Conflict, NotFound } = require("../../core/errors/errors");
const logger = require("../../utils/logger");

// In-memory Registry: OrderId -> Set Of Dispatched DriverIds In Current Batch
const dispatchRegistry = new Map();
// In-memory Registry: OrderId -> Global Expiry SetTimeout Handle
const expiryTimers = new Map();
// In-memory Registry: OrderId -> Promise Resolver For WaitForAcceptance()
const acceptanceResolvers = new Map();

// Calculate Great Circle Distance Between Two Points In Kilometers -> Formula: Haversine
function getHaversineDistance(lon1, lat1, lon2, lat2) {
  const R = 6371; // Earth Radius In Km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2)); // Return 2 Decimal Places For Precision
}

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
  async createOrder(userId, { pickupLng, pickupLat, destinationLng, destinationLat, pickupAddress, destinationAddress, notes, fareEstimate, partnerId, ambulanceType }) {
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
      pickupAddress: pickupAddress || null,
      destinationAddress: destinationAddress || null,
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

    // Return Enriched Details To Ensure Frontend Receives Legacy Fields (pickupLat, etc.)
    return this.getOrderDetails(order._id.toString(), userId, "user");
  }

  // User Or Driver Cancels An Order (Supports Granular Penalty Logic — No Transactions)
  async cancelOrder(orderId, userId, cancelBy = "user") {
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

    // Penalty Logic: Mid-trip Cancellations (After Pickup Or In-transport)
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
    const driverToUnlock = order.partnerId ? order.partnerId.toString() : (cancelBy === "driver" ? normalizedUserId : null);

    if (driverToUnlock) {
      await PartnerRepository.unlockDriver(driverToUnlock);

      // Notify Both Parties Via The Event Delivery Engine (MVP: Manual Trigger For Cancellation)
      NotificationService.trigger({
        orderId,
        type: cancelBy === "user" ? "USER_CANCELLED" : "DRIVER_REJECT_ORD",
        recipientId: cancelBy === "user" ? driverToUnlock : order.userId.toString(),
        actorId: userId,
        priority: "MEDIUM",
        channels: ["in_app", "store"],
        data: { orderId, by: cancelBy }
      });
    }

    return {
      message: `Order Cancelled By ${cancelBy.toUpperCase()}!`,
      penaltyFlag: penaltyApplied
    };
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
    if (
      order.partnerId &&
      ["accepted", "arrived", "pickup_started", "to_destination", "completed"].includes(order.status)
    ) {
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

    // Transform GeoJSON Coordinates Into Lat/Lng Structure With Smart Fallbacks
    let pickup = null;
    let destination = null;
    let distanceKm = order.distanceKm || null;

    if (order.pickupLocation && order.pickupLocation.coordinates) {
      const [pickupLng, pickupLat] = order.pickupLocation.coordinates;
      pickup = {
        lat: pickupLat,
        lng: pickupLng,
        address: order.pickupAddress || `Location [${pickupLat.toFixed(4)}, ${pickupLng.toFixed(4)}]`
      };

      if (order.destinationLocation && order.destinationLocation.coordinates) {
        const [destLng, destLat] = order.destinationLocation.coordinates;
        destination = {
          lat: destLat,
          lng: destLng,
          address: order.destinationAddress || `Location [${destLat.toFixed(4)}, ${destLng.toFixed(4)}]`
        };

        // Smart Calculation: Compute Trip Distance If Missing In Database
        if (!distanceKm) {
          distanceKm = getHaversineDistance(pickupLng, pickupLat, destLng, destLat);
        }
      }
    }

    // Smart Calculation: Distance To Pickup (If Requester Is A Driver Or In Negotiation)
    let distanceToPickupKm = null;
    if (isDriver || isNegotiator) {
      const driver = await PartnerRepository.findByUserId(normalizedReqId);
      if (driver && driver.location && driver.location.coordinates && pickup) {
        const [dLng, dLat] = driver.location.coordinates;
        distanceToPickupKm = getHaversineDistance(dLng, dLat, pickup.lng, pickup.lat);
      }
    }

    // Construct Final Response Payload
    const result = {
      ...order,
      pickup,
      destination,
      distanceKm,
      distanceToPickupKm,
      pickupLat: pickup ? pickup.lat : null,
      pickupLng: pickup ? pickup.lng : null,
      destinationLat: destination ? destination.lat : null,
      destinationLng: destination ? destination.lng : null,
      pickupAddress: pickup ? pickup.address : null,
      destinationAddress: destination ? destination.address : null,

      user: user
        ? {
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName
        }
        : null,
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

    // Broadcast Status Update To Trip Sync Room
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "arrived" });

    // 5. Proactively Trigger Specific Arrival Notification To User (With OTP Masking Logic)
    await NotificationService.trigger({
      orderId,
      type: "OTP_RECEIVED",
      recipientId: order.userId.toString(),
      actorId: partnerId,
      priority: "HIGH",
      channels: ["in_app", "store"],
      data: {
        message: "Your Driver Has Arrived! Provide The OTP To Start Trip Safely.",
        otp: order.otp.code,
        orderId: order._id
      }
    });

    // Return Enriched Details To Ensure Frontend Receives Legacy Fields (pickupLat, etc.)
    return this.getOrderDetails(orderId, partnerId, "driver");
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
    // Return Enriched Details To Ensure Frontend Receives Legacy Fields (pickupLat, etc.)
    return this.getOrderDetails(orderId, partnerId, "driver");
  }

  // Transition To En-route Full Perspective
  async beginTransport(orderId, partnerId) {
    await OrderRepository.updateStatusWithGuard(orderId, partnerId, "pickup_started", "to_destination");
    return this.getOrderDetails(orderId, partnerId, "driver");
  }

  // Final Completion — Driver Payout Ready
  async finishTrip(orderId, partnerId) {
    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, ["to_destination", "pickup_started"], "completed", {
      completedAt: new Date(),
    });
    if (!updated) throw new BadRequest("Invalid Trip State For Completion!");

    await PartnerRepository.unlockDriver(partnerId);
    await PartnerRepository.incrementTrips(partnerId); // Synchronize Static Trip Counter

    // 6. Final Status Update To Room Participants
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "completed" });

    // 7. Trigger Feedback Handshake & Completion Notice For User Via Delivery Engine
    const order = await OrderRepository.findById(orderId);
    await NotificationService.trigger({
      orderId,
      type: "DRIVER_FINISHED",
      recipientId: order.userId.toString(),
      actorId: partnerId,
      priority: "HIGH",
      channels: ["push", "in_app", "store"],
      data: {
        message: "Trip Completed! Please Share Your Feedback To Help Us Improve.",
        orderId: order._id,
        partnerId: order.partnerId
      }
    });

    // Return Enriched Details To Ensure Frontend Receives Legacy Fields (pickupLat, etc.)
    return this.getOrderDetails(orderId, partnerId, "driver");
  }

  // Get Active Order Support For Current Session Sync (Includes Populated Driver Details)
  async getActiveOrder(userId) {
    const activeOrder = await OrderRepository.findActiveByUserId(userId);
    if (!activeOrder) return null;
    return this.getOrderDetails(activeOrder._id, userId, "user");
  }

  async getOrderHistory(userId, status) {
    const orders = await OrderRepository.findHistoryByUserId(userId, status);
    
    // Enrich Each History Item With Legacy Fields For Consistent App Ui
    return Promise.all(orders.map(async (order) => {
      // Logic from getOrderHistoryByPartner but for user role
      const [lng, lat] = order.pickupLocation?.coordinates || [0, 0];
      const [dLng, dLat] = order.destinationLocation?.coordinates || [0, 0];
      
      return {
        ...order,
        pickupLat: lat,
        pickupLng: lng,
        destinationLat: dLat,
        destinationLng: dLng,
      };
    }));
  }

  async getActiveOrderByPartner(partnerId) {
    const activeOrder = await OrderRepository.findActiveByPartnerId(partnerId);
    if (!activeOrder) return null;
    return this.getOrderDetails(activeOrder._id, partnerId, "driver");
  }

  // Get Past Trip History For Driver (Includes Populated User/Patient Details)
  async getOrderHistoryByPartner(partnerId, status) {
    const orders = await OrderRepository.findHistoryByPartnerId(partnerId, status);

    // Map Over Orders To Inject Limited User Profile Data For The History View
    return Promise.all(orders.map(async (order) => {
      const user = await UserRepository.findById(order.userId.toString());

      // Hybrid Sync: Add Legacy Coordinates For History View Consistency
      const [lng, lat] = order.pickupLocation?.coordinates || [0, 0];
      const [dLng, dLat] = order.destinationLocation?.coordinates || [0, 0];

      return {
        ...order,
        pickupLat: lat,
        pickupLng: lng,
        destinationLat: dLat,
        destinationLng: dLng,
        user: user ? { name: user.name, firstName: user.firstName, lastName: user.lastName, phone: user.phone } : null
      };
    }));
  }
}

module.exports = new OrderService();
