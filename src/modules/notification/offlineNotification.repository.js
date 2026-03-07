// This File Handles The Offline Notification Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class OfflineNotificationRepository {
  // Queue A Notification For An Offline User
  async queueNotification(userId, event, data) {
    const collection = await getCollection("offline_notifications");
    return collection.insertOne({
      userId: new ObjectId(userId),
      event,
      data,
      createdAt: new Date(),
      delivered: false,
    });
  }

  // Fetch All Pending Notifications For A User Sorted By Creation Date
  async getPendingNotifications(userId) {
    const collection = await getCollection("offline_notifications");
    return collection
      .find({ userId: new ObjectId(userId), delivered: false })
      .sort({ createdAt: 1 })
      .toArray();
  }

  // Mark An Array Of Notification Ids As Delivered
  async markAsDelivered(notificationIds) {
    const collection = await getCollection("offline_notifications");
    return collection.updateMany(
      { _id: { $in: notificationIds } },
      { $set: { delivered: true } }
    );
  }
}

module.exports = new OfflineNotificationRepository();
