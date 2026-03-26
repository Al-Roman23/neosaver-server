// This File Handles The Notification Controller For The Elite Event Engine
const NotificationService = require("./notification.service");
const NotificationRepository = require("./notification.repository");
const { BadRequest } = require("../../core/errors/errors");

class NotificationController {
  // Trigger A Mission-critical Notification Flow (Service-based)
  async sendNotification(req, res, next) {
    try {
      const { userId, orderId, type, priority, channels, data, version } = req.body;

      if (!userId || !type || !orderId) {
        throw new BadRequest("UserId, Type, And OrderId Are Mandatory For Reliability!");
      }

      // Execute The Phased Trigger Lifecycle (Idempotency + Sequencing + Delivery)
      const result = await NotificationService.trigger({
        recipientId: userId,
        orderId,
        type,
        priority: priority || "MEDIUM",
        channels: channels || ["in_app", "store"],
        data: data || {},
        version: version || 0
      });

      res.status(201).json({
        success: true,
        notificationId: result.notificationId,
        message: "Event Formally Dispatched Via Reliability Engine.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Comprehensive Notification History For The User Dashboard
  async getHistory(req, res, next) {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new BadRequest("User Id Is Required For History Retrieval!");
      }

      // Fetch Verified Persistence Logs From Repository
      const history = await NotificationRepository.findByRecipientId(userId);

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
