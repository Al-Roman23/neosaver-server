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

  // Start The 30-second Heartbeat Reconciliation Job
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
      // 1. Acquire Distributed Lock (Atomic Insert)
      await lockCollection.insertOne({ lockKey, createdAt: new Date() });
      
      const now = new Date();
      logger.info("Executing Global Reconciliation Pulse (Distributed Lock Acquired)");

      // 2. Perform Parallel Reconciliation Tasks
      await Promise.allSettled([
        this.clearStaleNegotiationLocks(),
        this.reconcileExpiredSessions(now),
        this.reconcileGhostTrips()
      ]);

    } catch (err) {
      if (err.code !== 11000) {
        logger.error({ err }, "Global Reconciliation Task Execution Failed!");
      }
    } finally {
      // Release Lock For The Next Pulse
      await lockCollection.deleteOne({ lockKey }).catch(() => {});
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
    const expiredSessions = await negotiationCollection
      .find({ status: "active", expiresAt: { $lt: now } })
      .toArray();

    if (expiredSessions.length > 0) {
      logger.info({ count: expiredSessions.length }, "Cleaning Up Expired Negotiation Sessions...");
      
      await Promise.allSettled(expiredSessions.map(async (session) => {
        // Mark Session As Expired In DB
        await NegotiationRepository.updateStatus(session._id, "expired_timeout", { 
          endedReason: "no_response_timeout" 
        });

        // Unlock Participant Driver
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

  // Task: Auto-Cancel "Ghost" Trips (Arrived But No Movement For 15m)
  async reconcileGhostTrips() {
    const ghostTimeLimit = new Date(Date.now() - 15 * 60 * 1000);
    const ordersCollection = await getCollection("orders");
    const ghostOrders = await ordersCollection
      .find({ status: "arrived", updatedAt: { $lt: ghostTimeLimit } })
      .toArray();

    if (ghostOrders.length > 0) {
      logger.warn({ count: ghostOrders.length }, "System Cancelling Inactive 'Arrived' Orders (Ghost Trips)...");
      await Promise.allSettled(ghostOrders.map(async (order) => {
        await OrderRepository.updateStatus(order._id, "cancelled_system", { 
          cancelledAt: new Date(), 
          penaltyFlag: true 
        });
        await PartnerRepository.unlockDriver(order.partnerId.toString());
      }));
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
