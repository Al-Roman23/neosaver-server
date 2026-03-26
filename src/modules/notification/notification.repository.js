// This File Handles The Permanent Notification Registry And History
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class NotificationRepository {
  // Create A Finalized Notification With Detailed Delivery State
  async createNotification(notificationData) {
    const collection = await getCollection("notifications");

    // Ensure Critical Performance Indexing
    await collection.createIndex({ recipientId: 1, deliveryStatus: 1, createdAt: -1 });

    return collection.insertOne({
      ...notificationData,
      recipientId: new ObjectId(notificationData.recipientId),
      actorId: notificationData.actorId ? new ObjectId(notificationData.actorId) : null,
      orderId: new ObjectId(notificationData.orderId),
      deliveryStatus: notificationData.deliveryStatus || "PENDING", // Pending | Sent | Failed
      readStatus: "UNREAD", // Unread | Read
      isSuppressed: !!notificationData.isSuppressed, // Audit Flag
      pushStatus: "NONE", // None | Queued | Sent | Failed
      sequence: notificationData.sequence,
      retryCount: 0,
      createdAt: new Date(),
    });
  }

  // Update Delivery Confirmations (After Socket ACK)
  async markAsDelivered(notificationId) {
    const collection = await getCollection("notifications");
    return collection.updateOne(
      { _id: new ObjectId(notificationId) },
      { $set: { deliveryStatus: "SENT", deliveredAt: new Date() } }
    );
  }

  // Revert Status To Pending If Delivery ACK Fails (For Worker Retry)
  async revertToPending(notificationId) {
    const collection = await getCollection("notifications");
    return collection.updateOne(
      { _id: new ObjectId(notificationId) },
      { $set: { deliveryStatus: "PENDING" } }
    );
  }

  // Fetch History For Notification Center
  async findByRecipientId(recipientId, limit = 50) {
    const collection = await getCollection("notifications");
    return collection
      .find({ recipientId: new ObjectId(recipientId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  // Find Pending Critical Notifications For Background Worker
  async findPendingForRetry(priorityLevels = ["HIGH", "MEDIUM"]) {
    const collection = await getCollection("notifications");
    return collection
      .find({
        deliveryStatus: "PENDING",
        priority: { $in: priorityLevels },
      })
      .toArray();
  }

  // Increment Internal Retry Counter For Background Worker Scheduling
  async incrementRetry(notificationId) {
    const collection = await getCollection("notifications");
    return collection.updateOne(
      { _id: new ObjectId(notificationId) },
      { $inc: { retryCount: 1 } }
    );
  }
}

module.exports = new NotificationRepository();
