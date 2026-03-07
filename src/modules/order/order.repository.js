// This File Handles The Order Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class OrderRepository {
  // Insert A New Pending Order Document
  async createOrder(orderData) {
    const ordersCollection = await getCollection("orders");
    const result = await ordersCollection.insertOne({
      ...orderData,
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

  // Atomically Accept Order — Sets Status, Partnerid, And Acceptedat In One Operation
  async atomicAccept(orderId, partnerId) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.findOneAndUpdate(
      { _id: new ObjectId(orderId), status: "pending" },
      {
        $set: {
          status: "accepted",
          partnerId: new ObjectId(partnerId),
          acceptedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
  }

  // Set Driver's Live Location Inside The Order Document (For App-reopen Sync)
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

  // Update Status With A Partner Id Guard (Security Check)
  async updateStatusWithGuard(orderId, partnerId, status, extraFields = {}) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.findOneAndUpdate(
      { _id: new ObjectId(orderId), partnerId: new ObjectId(partnerId) },
      { $set: { status, ...extraFields, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  // General Lifecycle Status Update
  async updateStatus(orderId, status, extraFields = {}) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status, ...extraFields, updatedAt: new Date() } }
    );
  }

  // Get User's Current Active Order
  async findActiveByUserId(userId) {
    const ordersCollection = await getCollection("orders");
    const activeStatuses = ["pending", "accepted", "pickup_started", "to_destination"];
    return ordersCollection.findOne({
      userId: new ObjectId(userId),
      status: { $in: activeStatuses },
    });
  }

  // Get User's Full Order History
  async findHistoryByUserId(userId) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  // Get Driver's Full Order History
  async findHistoryByPartnerId(partnerId) {
    const ordersCollection = await getCollection("orders");
    return ordersCollection
      .find({ partnerId: new ObjectId(partnerId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  // Get Driver's Current Active Order
  async findActiveByPartnerId(partnerId) {
    const ordersCollection = await getCollection("orders");
    const activeStatuses = ["accepted", "pickup_started", "to_destination"];
    return ordersCollection.findOne({
      partnerId: new ObjectId(partnerId),
      status: { $in: activeStatuses },
    });
  }
}

module.exports = new OrderRepository();
