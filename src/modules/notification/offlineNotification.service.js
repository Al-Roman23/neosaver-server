// This File Handles The Offline Notification Service
const OfflineNotificationRepository = require("./offlineNotification.repository");
const logger = require("../../utils/logger");

class OfflineNotificationService {
  // Logic To Queue Notification For Offline User
  async queueNotification(userId, event, data) {
    try {
      await OfflineNotificationRepository.queueNotification(userId, event, data);
      logger.info({ userId, event }, "Notification Queued For Offline User!");
    } catch (error) {
      logger.error({ error, userId }, "Failed To Queue Notification!");
    }
  }

  // Logic To Deliver Pending Notifications Once A User Connects
  async deliverPendingNotifications(userId, socketInstance) {
    try {
      const pendingNotifications = await OfflineNotificationRepository.getPendingNotifications(userId);

      if (pendingNotifications.length === 0) return;

      const deliveredIds = [];

      for (const notification of pendingNotifications) {
        socketInstance.emit(notification.event, notification.data);
        deliveredIds.push(notification._id);
      }

      // Mark All Sent Notifications As Delivered In Bulk
      if (deliveredIds.length > 0) {
        await OfflineNotificationRepository.markAsDelivered(deliveredIds);
        logger.info({ userId, count: deliveredIds.length }, "Delivered Pending Offline Notifications!");
      }
    } catch (error) {
      logger.error({ error, userId }, "Failed To Deliver Pending Notifications!");
    }
  }
}

module.exports = new OfflineNotificationService();
