// This File Handles The Order Service Logic
const OrderRepository = require("./order.repository");
const PartnerRepository = require("../partner/partner.repository");
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");
const { BadRequest, Conflict, NotFound } = require("../../core/errors/errors");

// In-memory Registry: Orderid -> Set Of Dispatched Driverids In Current Batch
const dispatchRegistry = new Map();
// In-memory Registry: Orderid -> Global Expiry Settimeout Handle
const expiryTimers = new Map();
// In-memory Registry: Orderid -> Promise Resolver For Waitforacceptance()
const acceptanceResolvers = new Map();

class OrderService {
  // Create A New Order And Run The Dispatch Engine
  async createOrder(userId, { pickupLng, pickupLat, destinationLng, destinationLat, notes }) {
    if (!pickupLng || !pickupLat || !destinationLng || !destinationLat) {
      throw new BadRequest("Pickup And Destination Coordinates Are Required!");
    }

    // Check For Active Order Conflict
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
    });

    const orderId = order._id.toString();

    // Start Global 2-minute Expiry Timer
    this._startExpiryTimer(orderId, userId);

    // Run Dispatch In Background (Non-Blocking For Http Response)
    this._runDispatch(orderId, userId, pickupLng, pickupLat).catch(() => {});

    return order;
  }

  // Query Nearby Available Drivers Using Geospatial Index
  async _findNearbyDrivers(pickupLng, pickupLat) {
    const collection = await getCollection("partners");
    return collection
      .find({
        location: {
          $nearSphere: {
            $geometry: { type: "Point", coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)] },
            $maxDistance: 10000, // 10km Radius
          },
        },
        isOnline: true,
        currentOrderId: null,
        lastLocationUpdate: { $gt: new Date(Date.now() - 300000) }, // 5-Minute Freshness
      })
      .limit(20)
      .toArray();
  }

  // Batched Sequential Dispatch Loop
  async _runDispatch(orderId, userId, pickupLng, pickupLat) {
    const socketService = require("../../core/socket");
    
    // Check If Order Is Still Pending Before Searching
    const orderCheck = await OrderRepository.findById(orderId);
    if (!orderCheck || orderCheck.status !== "pending") return;

    const drivers = await this._findNearbyDrivers(pickupLng, pickupLat);

    // If No Drivers Found, Wait 10 Seconds And Retry Instead Of Expiring Instantly
    if (drivers.length === 0) {
      setTimeout(() => {
        this._runDispatch(orderId, userId, pickupLng, pickupLat).catch(() => {});
      }, 10000);
      return;
    }

    const batchSize = 3;
    for (let i = 0; i < drivers.length; i += batchSize) {
      // Refresh Order Status Before Each Batch
      const order = await OrderRepository.findById(orderId);
      if (!order || order.status !== "pending") return;

      const batch = drivers.slice(i, i + batchSize);
      const batchIds = batch.map((d) => d.userId.toString());
      dispatchRegistry.set(orderId, new Set(batchIds));

      const orderPayload = {
        orderId,
        pickupLocation: order.pickupLocation,
        destinationLocation: order.destinationLocation,
        notes: order.notes,
        createdAt: order.createdAt,
      };

      batchIds.forEach((driverUserId) => {
        socketService.io.to("driver_" + driverUserId).emit("new_order_request", orderPayload);
      });

      const accepted = await this._waitForAcceptance(orderId, 15000);
      if (accepted) return;
    }

    // All Batches Exhausted? Don't Expire Yet! Wait 10s And Retry The Whole Search.
    // The Global 2-minute Timer Will Eventually Call _expireorder If Nothing Happens.
    setTimeout(() => {
      this._runDispatch(orderId, userId, pickupLng, pickupLat).catch(() => {});
    }, 10000);
  }

  // Wait For Acceptance Signal From Socket Layer
  _waitForAcceptance(orderId, timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        acceptanceResolvers.delete(orderId);
        resolve(false);
      }, timeout);

      acceptanceResolvers.set(orderId, () => {
        clearTimeout(timer);
        acceptanceResolvers.delete(orderId);
        resolve(true);
      });
    });
  }

  // Called By Socket Layer When A Driver Accepts
  signalAcceptance(orderId) {
    const resolver = acceptanceResolvers.get(orderId);
    if (resolver) resolver();
  }

  // Start The Global 2-minute Expiry Timer
  _startExpiryTimer(orderId, userId) {
    const timer = setTimeout(() => {
      this._expireOrder(orderId, userId);
    }, 2 * 60 * 1000);
    expiryTimers.set(orderId, timer);
  }

  // Stop The Global Expiry Timer (Called On Acceptance Or Cancellation)
  cancelExpiryTimer(orderId) {
    const timer = expiryTimers.get(orderId);
    if (timer) {
      clearTimeout(timer);
      expiryTimers.delete(orderId);
    }
  }

  // Expire An Order And Notify User
  async _expireOrder(orderId, userId) {
    this.cancelExpiryTimer(orderId);
    const order = await OrderRepository.findById(orderId);
    if (!order || order.status !== "pending") return;
    await OrderRepository.updateStatus(orderId, "expired", { cancelledAt: new Date() });

    const socketService = require("../../core/socket");
    socketService.sendToUser(userId, "order_expired", {
      orderId,
      message: "No Drivers Available Nearby. Please Try Again.",
    });
  }

  // User Cancels An Active Order
  async cancelOrder(orderId, userId) {
    const order = await OrderRepository.findById(orderId);
    if (!order) throw new NotFound("Order Not Found!");
    if (order.userId.toString() !== userId) throw new BadRequest("Unauthorized!");
    if (!["pending", "accepted"].includes(order.status)) {
      throw new BadRequest("This Order Cannot Be Cancelled!");
    }

    this.cancelExpiryTimer(orderId);
    dispatchRegistry.delete(orderId);
    await OrderRepository.updateStatus(orderId, "cancelled", { cancelledAt: new Date() });

    // Unlock Driver If Already Assigned
    if (order.partnerId) {
      await PartnerRepository.unlockDriver(order.partnerId.toString());
      const socketService = require("../../core/socket");
      socketService.io.to("driver_" + order.partnerId.toString()).emit("order_cancelled", { orderId });
    }

    return { message: "Order Cancelled Successfully!" };
  }

  // Driver Arrives At Pickup Point
  async arrived(orderId, partnerId) {
    const order = await OrderRepository.findById(orderId);
    if (!order || order.status !== "accepted") {
      throw new BadRequest("Order Must Be In 'Accepted' State To Mark As Arrived!");
    }

    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, "arrived");
    if (!updated) throw new BadRequest("Cannot Update Status: Access Denied Or Invalid Order State!");

    const socketService = require("../../core/socket");
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "arrived" });
    return updated;
  }

  // Patient Picked Up — Trip To Destination Starts
  async startTrip(orderId, partnerId) {
    const order = await OrderRepository.findById(orderId);
    if (!order || order.status !== "arrived") {
      throw new BadRequest("Order Must Be In 'Arrived' State To Start The Trip!");
    }

    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, "pickup_started", {
      pickupStartedAt: new Date(),
    });
    if (!updated) throw new BadRequest("Cannot Update Status: Access Denied Or Invalid Order State!");

    const socketService = require("../../core/socket");
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "pickup_started" });
    return updated;
  }

  // Driver Reaches Destination — Trip Complete
  async completeTrip(orderId, partnerId) {
    const order = await OrderRepository.findById(orderId);
    if (!order || !["pickup_started", "to_destination"].includes(order.status)) {
      throw new BadRequest("Order Must Be In 'Started' State To Complete!");
    }

    const updated = await OrderRepository.updateStatusWithGuard(orderId, partnerId, "completed", {
      completedAt: new Date(),
    });
    if (!updated) throw new BadRequest("Cannot Update Status: Access Denied Or Invalid Order State!");

    // Critical: Unlock Driver For New Dispatches
    await PartnerRepository.unlockDriver(partnerId);

    const socketService = require("../../core/socket");
    socketService.io.to("order_" + orderId).emit("trip_status_update", { status: "completed" });
    return updated;
  }

  // Get Current Active Order For User
  async getActiveOrder(userId) {
    return OrderRepository.findActiveByUserId(userId);
  }

  // Get Order History For User
  async getOrderHistory(userId) {
    return OrderRepository.findHistoryByUserId(userId);
  }

  // Get Current Active Order For Driver
  async getActiveOrderByPartner(partnerId) {
    return OrderRepository.findActiveByPartnerId(partnerId);
  }

  // Get Order History For Driver
  async getOrderHistoryByPartner(partnerId) {
    return OrderRepository.findHistoryByPartnerId(partnerId);
  }

  // Get The Dispatch Registry (For Socket Layer To Notify Other Batch Drivers)
  getDispatchedBatch(orderId) {
    return dispatchRegistry.get(orderId);
  }
}

module.exports = new OrderService();
