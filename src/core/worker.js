// This File Handles Persistent Background State Inconsistencies And Timeouts
const logger = require("../utils/logger");
const PartnerRepository = require("../modules/partner/partner.repository");
const OrderRepository = require("../modules/order/order.repository");
const NegotiationRepository = require("../modules/negotiation/negotiation.repository");
const { getCollection } = require("../config/db");

class BackgroundWorker {
  constructor() {
    this.reconciliationInterval = null;
  }

  // Start The 30-Second Heartbeat Reconciliation Job
  start() {
    logger.info("Starting Global Reconciliation Heartbeat (30s)...");
    this.reconciliationInterval = setInterval(() => {
      this.runReconciliation().catch((err) => {
        logger.error({ err }, "Global Reconciliation Job Failed!");
      });
    }, 30000); // 30s Heartbeat
  }

  // Reconcile Stale Drivers, Expired Bidding, And Zombie Orders
  async runReconciliation() {
    const lockCollection = await getCollection("worker_locks");
    const lockKey = "global_reconciliation_pulse";

    try {
      // Acquire Distributed Lock (Atomic Insert)
      await lockCollection.insertOne({ lockKey, createdAt: new Date() });

      const now = new Date();
      logger.info("Executing Global Reconciliation Pulse (Distributed Lock Acquired)!");

      // Perform Parallel Reconciliation Tasks
      await Promise.allSettled([
        this.clearStaleNegotiationLocks(),
        this.reconcileExpiredSessions(now),
        this.reconcileGhostTrips(),
        this.reconcileBackgroundGracePeriods(),
        this.reconcilePendingNotifications()
      ]);

    } catch (err) {
      if (err.code !== 11000) {
        logger.error({ err }, "Global Reconciliation Task Execution Failed!");
      }
    } finally {
      // Release Lock For The Next Pulse
      await lockCollection.deleteOne({ lockKey }).catch(() => { });
    }
  }

  // Task: Release Drivers With Stale Background Grace Periods (10+ Mins)
  async reconcileBackgroundGracePeriods() {
    try {
      const partnersCollection = await getCollection("partners");

      const staleThreshold = new Date(Date.now() - 59 * 60 * 1000); // 59 Minutes Dead Man Switch
      const result = await partnersCollection.updateMany(
        {
          $or: [
            { isOnline: true },
            { isAppInBackground: true }
          ],
          lastAppHeartbeatAt: { $lt: staleThreshold }
        },
        {
          $set: {
            isOnline: false,
            isAppInBackground: false,
            updatedAt: new Date()
          }
        }
      );

      if (result.modifiedCount > 0) {
        logger.info({ count: result.modifiedCount }, "Reconciled Stale Driver Background States!");
      }
    } catch (err) {
      logger.error({ err }, "Background State Reconciliation Failed!");
    }
  }

  // Task: Release Drivers With Expired Negotiation Locks
  async clearStaleNegotiationLocks() {
    const releasedLocks = await PartnerRepository.clearStaleLocks();
    if (releasedLocks.modifiedCount > 0) {
      logger.warn({ count: releasedLocks.modifiedCount }, "Released Stale Driver Negotiation Locks!");
    }
  }

  // Task: Handle Expired Negotiation Sessions
  async reconcileExpiredSessions(now) {
    const negotiationCollection = await getCollection("negotiation_sessions");

    // Find Sessions That Are Stuck On "Active" But Their Timer Ran Out
    const expiredSessions = await negotiationCollection
      .find({ status: "active", expiresAt: { $lt: now } })
      .toArray();

    if (expiredSessions.length > 0) {
      logger.info({ count: expiredSessions.length }, "Cleaning Up Expired Negotiation Sessions...");

      await Promise.allSettled(expiredSessions.map(async (session) => {
        // Mark The Session As Expired In The Database
        await NegotiationRepository.updateStatus(session._id, "expired_timeout", {
          endedReason: "no_response_timeout"
        });

        // Unlock The Driver
        await PartnerRepository.unlockFromNegotiation(session.driverId);

        // Reset Order Document For User Discovery
        await OrderRepository.recordNegotiationAttempt(session.orderId, session.driverId);

        // Notify Participant Sockets
        const socketService = require("./socket");
        socketService.sendToUser(session.userId.toString(), "negotiation_expired", {
          orderId: session.orderId,
          message: "No Response From Driver. Negotiation Terminated."
        });
        socketService.sendToUser(session.driverId.toString(), "negotiation_expired", {
          orderId: session.orderId,
          message: "Negotiation Timed Out Due To Inactivity."
        });
      }));
    }
  }

  // Task: Auto-Cancel "Ghost" Trips (Arrived But No Movement For 15 Minutes)
  async reconcileGhostTrips() {
    // Calculate The Time Limit (15 Minutes Ago)
    const ghostTimeLimit = new Date(Date.now() - 15 * 60 * 1000);

    const ordersCollection = await getCollection("orders");

    // Find Orders That Are Stuck On Arrived But Their Timer Ran Out
    const ghostOrders = await ordersCollection
      .find({ status: "arrived", updatedAt: { $lt: ghostTimeLimit } })
      .toArray();

    if (ghostOrders.length > 0) {
      logger.warn({ count: ghostOrders.length }, "System Cancelling Inactive 'Arrived' Orders (Ghost Trips)...");
      await Promise.allSettled(ghostOrders.map(async (order) => {
        // Update Order Status To Cancelled
        await OrderRepository.updateStatus(order._id, "cancelled_system", {
          cancelledAt: new Date(),
          penaltyFlag: true
        });

        // Unlock The Driver With Penalty Flag Applied
        await PartnerRepository.unlockDriver(order.partnerId.toString());
      }));
    }
  }

  // Task: Surface And Retry Missed Critical Notifications (High/Medium Only)
  async reconcilePendingNotifications() {
    try {
      const NotificationRepository = require("../modules/notification/notification.repository");
      const NotificationService = require("../modules/notification/notification.service");

      const pending = await NotificationRepository.findPendingForRetry(["HIGH", "MEDIUM"]);
      if (pending.length === 0) return;

      const now = Date.now();
      for (const n of pending) {
        // Calculate Age In Seconds
        const ageSec = (now - new Date(n.createdAt)) / 1000;

        // Exponential Backoff: 5 Seconds -> 15 Seconds -> 45 Seconds (Retry Only If Threshold Met)
        let shouldRetry = false;
        if (ageSec > 45 && n.retryCount < 3) shouldRetry = true;
        else if (ageSec > 15 && n.retryCount < 2) shouldRetry = true;
        else if (ageSec > 5 && n.retryCount < 1) shouldRetry = true;

        if (shouldRetry) {
          logger.info({ notificationId: n._id }, "Retrying Critical Notification Delivery Via Background Worker.");

          // Increment Internal Retry Counter Before Delivery Attempt
          await NotificationRepository.incrementRetry(n._id);

          await NotificationService.deliverRealTime(
            n._id, n.recipientId.toString(), n.type, n.content, n.sequence
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "Pending Notification Reconciliation Pulse Failed!");
    }
  }

  stop() {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
    }
  }
}

module.exports = new BackgroundWorker();
