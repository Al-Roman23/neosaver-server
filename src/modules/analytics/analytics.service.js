// This File Handles The Analytics Engine For Business Insights
const { getCollection } = require("../../config/db");
const logger = require("../../utils/logger");

class AnalyticsService {
  // Record A Negotiation Round Completion For KPI Tracking
  async logNegotiationEvent(orderId, sessionId, driverId, round, outcome, finalAmount = null) {
    try {
      const { ObjectId } = require("mongodb");
      const collection = await getCollection("negotiation_analytics");
      await collection.insertOne({
        orderId: new ObjectId(orderId),
        sessionId: new ObjectId(sessionId),
        driverId: new ObjectId(driverId),
        roundCount: round,
        outcome, // accepted, rejected, expired_timeout
        finalPrice: finalAmount,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error({ error }, "Failed To Log Negotiation Analytics!");
    }
  }

  // Record Driver Penalty (Post-OTP Cancellation)
  async logDriverPenalty(driverId, orderId, reason) {
    try {
      const collection = await getCollection("driver_penalties");
      await collection.insertOne({
        driverId,
        orderId,
        reason,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error({ error }, "Failed To Log Penalty Analytics!");
    }
  }

  // Retrieve Aggregated Conversion Rates (Mock Implementation For Dashboard)
  async getCompletionMetrics() {
    const collection = await getCollection("negotiation_analytics");
    return collection.aggregate([
      { $group: { _id: "$outcome", count: { $sum: 1 } } }
    ]).toArray();
  }
}

module.exports = new AnalyticsService();
