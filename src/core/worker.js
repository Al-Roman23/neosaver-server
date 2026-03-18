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
    const now = new Date();
    
    // 1. Release Drivers With Expired Negotiation Locks
    const releasedLocks = await PartnerRepository.clearStaleLocks();
    if (releasedLocks.modifiedCount > 0) {
      logger.warn({ count: releasedLocks.modifiedCount }, "Released Stale Driver Negotiation Locks!");
    }

    // 2. Handle Expired Negotiation Sessions
    const negotiationCollection = await getCollection("negotiation_sessions");
    const expiredSessions = await negotiationCollection
      .find({ status: "active", expiresAt: { $lt: now } })
      .toArray();

    for (const session of expiredSessions) {
      logger.info({ sessionId: session._id, orderId: session.orderId }, "Cleaning Up Expired Negotiation Session...");
      
      // Mark Session As Expired In DB
      await NegotiationRepository.updateStatus(session._id, "expired_timeout", { 
        endedReason: "no_response_timeout" 
      });

      // Unlock Participant Driver
      await PartnerRepository.unlockFromNegotiation(session.driverId);

      // Reset Order Document For User Discovery
      await OrderRepository.recordNegotiationAttempt(session.orderId, session.driverId);

      // Notify Participant Sockets (If Connected)
      const socketService = require("./socket");
      socketService.sendToUser(session.userId.toString(), "negotiation_expired", { 
        orderId: session.orderId, 
        message: "No Response From Driver. Negotiation Terminated." 
      });
      socketService.sendToUser(session.driverId.toString(), "negotiation_expired", { 
        orderId: session.orderId, 
        message: "Negotiation Timed Out Due To Inactivity." 
      });
    }

    // 3. Auto-Cancel "Ghost" Trips (Arrived But No Movement For 15m)
    const ghostTimeLimit = new Date(Date.now() - 15 * 60 * 1000);
    const ordersCollection = await getCollection("orders");
    const ghostOrders = await ordersCollection
      .find({ status: "arrived", updatedAt: { $lt: ghostTimeLimit } })
      .toArray();

    for (const order of ghostOrders) {
      logger.warn({ orderId: order._id }, "System Cancelling Inactive 'Arrived' Order (Ghost Trip)...");
      await OrderRepository.updateStatus(order._id, "cancelled_system", { 
        cancelledAt: new Date(), 
        penaltyFlag: true // System Penalization For Stalling
      });
      await PartnerRepository.unlockDriver(order.partnerId.toString());
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
