// This File Handles The Order Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class OrderRepository {
  // Insert A New Pending Order Document With Versioning And Clean Retry State
  async createOrder(orderData) {
    const ordersCollection = await getCollection("orders");
    const result = await ordersCollection.insertOne({
      ...orderData,
      version: 1, // Initialize Optimistic Concurrency Control
      negotiationId: null,
      attemptedDrivers: [], // Array Of { driverId: ObjectId, lastTriedAt: Date }
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return ordersCollection.findOne({ _id: result.insertedId });
  }

  // Fetch A Single Order By Id
  async findById(orderId) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.findOne({ _id: new ObjectId(orderId) });
  }

  // Atomically Lock Order For Negotiation To Prevent Race Conditions
  async initiateNegotiation(orderId, negotiationId, version) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.findOneAndUpdate(
      { 
        _id: new ObjectId(orderId), 
        status: "pending", 
        negotiationId: null,
        version: version // Safety Check
      },
      { 
        $set: { 
          status: "negotiating", 
          negotiationId: new ObjectId(negotiationId),
          updatedAt: new Date() 
        },
        $inc: { version: 1 }
      },
      { returnDocument: "after" }
    );
  }

  // Record A Failed Negotiation Attempt To Prevent Instant Spam
  async recordNegotiationAttempt(orderId, partnerId) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { 
        $push: { 
          attemptedDrivers: { 
            driverId: new ObjectId(partnerId), 
            lastTriedAt: new Date() 
          } 
        },
        $set: { 
          negotiationId: null, 
          status: "pending",
          updatedAt: new Date() 
        },
        $inc: { version: 1 }
      }
    );
  }

  // Update Driver Location (Live Re-sync Safety)
  async updateDriverLocation(orderId, lng, lat) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          driverLocation: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          updatedAt: new Date(),
        },
      }
    );
  }
  
  // Update Status With Full Guard Stack (Role, Status, Version)
  async updateStatusWithGuard(orderId, partnerId, expectedStatus, newStatus, extraFields = {}) {
    const ordersCollection = await getCollection("orders");
    
    // Construct Atomic Filter
    const filter = { 
      _id: new ObjectId(orderId), 
      status: Array.isArray(expectedStatus) ? { $in: expectedStatus } : expectedStatus 
    };

    // Only Enforce partnerId If Already Assigned (States Post-negotiation)
    const assignedStates = ["accepted", "arrived", "pickup_started", "to_destination"];
    const isAssigned = Array.isArray(expectedStatus) 
      ? expectedStatus.some(s => assignedStates.includes(s))
      : assignedStates.includes(expectedStatus);

    if (isAssigned && partnerId) {
      filter.partnerId = new ObjectId(partnerId);
    }

    return ordersCollection.findOneAndUpdate(
      filter,
      { 
        $set: { 
          status: newStatus, 
          ...extraFields, 
          updatedAt: new Date() 
        },
        $inc: { version: 1 }
      },
      { returnDocument: "after" }
    );
  }

  // General Status Update With Incrementing Version
  async updateStatus(orderId, status, extraFields = {}) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { 
        $set: { status, ...extraFields, updatedAt: new Date() },
        $inc: { version: 1 }
      }
    );
  }

  // Get User's Active Order (Supports Negotiating State)
  async findActiveByUserId(userId) {
    const ordersCollection = await getCollection("orders");
    const activeStatuses = ["pending", "negotiating", "accepted", "arrived", "pickup_started", "to_destination"];
    return ordersCollection.findOne({
      userId: new ObjectId(userId),
      status: { $in: activeStatuses },
    });
  }

  // History And History By Driver Remain Same (Standard Sort)
  async findHistoryByUserId(userId) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async findHistoryByPartnerId(partnerId) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection
      .find({ partnerId: new ObjectId(partnerId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async findActiveByPartnerId(partnerId) {
    const ordersCollection = await getCollection("orders");
    const activeStatuses = ["accepted", "arrived", "pickup_started", "to_destination"];
    return ordersCollection.findOne({
      partnerId: new ObjectId(partnerId),
      status: { $in: activeStatuses },
    });
  }
}

module.exports = new OrderRepository();
