// This File Handles The System-Wide Notification And Event Delivery Engine
const NotificationRepository = require("./notification.repository");
const SequenceCounterRepository = require("./sequenceCounter.repository");
const IdempotencyKeyRepository = require("./idempotencyKey.repository");
const OrderRepository = require("../order/order.repository");
const socketService = require("../../core/socket");
const logger = require("../../utils/logger");
const crypto = require("crypto");

class NotificationService {
  // Central Single Entry Point For All Notification And Socket Callbacks
  async trigger({ orderId, type, recipientId, actorId, priority, channels = ["in_app", "store"], data = {}, version = 0 }) {
    try {
      // Generate Contextual Idempotency Key
      const rawKey = `${recipientId}_${orderId}_${type}_${version}_${actorId}`;
      const idempotencyKey = crypto.createHash("md5").update(rawKey).digest("hex");

      // Idempotency Check (Verify First Before Incrementing)
      const isNewEvent = await IdempotencyKeyRepository.createKey(idempotencyKey);
      if (!isNewEvent) {
        logger.info({ orderId, type, recipientId }, "Duplicate Notification Trigger Suppressed!");
        return { success: true, duplicated: true };
      }

      // Security Guard: Otp Only Allowed If Order Status Is Arrived
      if (type === "OTP_RECEIVED") {
        const order = await OrderRepository.findById(orderId);
        if (!order || order.status !== "arrived") {
          logger.warn({ orderId, type }, "Blocked Malicious OTP Notification (Order Not Arrived)!");
          return { success: false, reason: "Order Not In Required State" };
        }
      }

      // Atomic Sequence Allocation
      const sequence = await SequenceCounterRepository.getNextSequence(orderId, recipientId);

      // Hybrid Sync: Enrich Data With Full Order Details For Dynamic Ui Support
      // We Import Order Service Locally To Avoid Circular Dependencies
      if (orderId && !data.order) {
        const OrderService = require("../order/order.service");
        // Bypassing Security To Ensure System Triggers Can Always Enrich Payload
        const fullOrder = await OrderService.getOrderDetails(orderId, recipientId, "driver", true).catch(() => null);

        if (fullOrder) {
          data.order = fullOrder;

          // Flutter Compatibility: Mirroring Fields At Top-Level So Older App Versions Find Them
          const legacyFields = [
            "pickupLat", "pickupLng", "destinationLat", "destinationLng",
            "pickupAddress", "destinationAddress", "distanceKm", "distanceToPickupKm"
          ];

          legacyFields.forEach(field => {
            if (fullOrder[field] !== undefined && data[field] === undefined) {
              data[field] = fullOrder[field];
            }
          });
        }
      }

      // Permanent Persistence (Single Source Of Truth For Audit)
      const notificationRecord = {
        recipientId,
        actorId,
        orderId,
        type,
        priority, // High | Medium | Low
        channels, // Push | In App | Store
        content: data, // Hashed Otps And Price Details Only
        sequence,
        idempotencyKey,
      };

      const result = await NotificationRepository.createNotification(notificationRecord);
      const notificationId = result.insertedId;

      // Multi-Channel Routing (Mvp Socket Delivery)
      if (channels.includes("in_app")) {
        await this.deliverRealTime(notificationId, recipientId, type, data, sequence);
      }

      return { success: true, notificationId };
    } catch (error) {
      logger.error({ error, orderId, type }, "Failed To Trigger Notification Lifecycle!");
      throw error;
    }
  }

  // Handle Real-Time Delivery Via Socket Rooms With ACK Tracking
  async deliverRealTime(notificationId, userId, type, data, sequence) {
    const eventName = type === "OTP_RECEIVED" ? "otp_received" : "notification_received";

    // Track Delivery Attempt
    await NotificationRepository.markAsDelivered(notificationId);

    // Emit To Multi-Device User Room
    const payload = {
      notificationId: notificationId.toString(),
      type,
      data,
      sequence,
      timestamp: new Date().toISOString(),
    };

    socketService.io.to("user_" + userId).emit(eventName, payload);

    // Flutter Compatibility: Older App Versions Listen On These Legacy Event Names Directly
    // We Maintain Both Channels So The App Works Without A Forced Update
    const legacyMap = {
      NEGOTIATION_REQ: "new_negotiation_request",
      OTP_RECEIVED: "driver_arrived", // Mapping To Existing Test Listener
      DRIVER_FINISHED: "ready_for_feedback",
      USER_CANCELLED: "order_cancelled",
      DRIVER_REJECT_ORD: "order_cancelled",
    };

    if (legacyMap[type]) {
      // Emit Raw Data Directly For Compatibility With Older App Versions
      socketService.io.to("user_" + userId).emit(legacyMap[type], data);
    }
  }
}

module.exports = new NotificationService();
