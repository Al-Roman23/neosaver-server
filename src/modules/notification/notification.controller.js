// This File Handles The Notification Controller For Testing Api
const OfflineNotificationRepository = require("./offlineNotification.repository");
const SocketService = require("../../core/socket");
const { BadRequest } = require("../../core/errors/errors");

class NotificationController {
  // Send Or Queue A Notification
  async sendNotification(req, res, next) {
    try {
      const { userId, event, data } = req.body;

      if (!userId || !event || !data) {
        throw new BadRequest("User ID, Event, And Data Are Required!");
      }

      // Attempt To Send Instantly (Will Queue If User Offline)
      SocketService.sendToUser(userId, event, data);

      res.json({
        success: true,
        message: "Notification Processed (Sent Or Queued).",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Pending Notifications For Verification
  async getPendingNotifications(req, res, next) {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new BadRequest("User ID Is Required!");
      }

      const pending = await OfflineNotificationRepository.getPendingNotifications(userId);

      res.json({
        success: true,
        data: pending,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
