// This File Handles The Negotiation Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class NegotiationRepository {
  // Create A New Negotiation Session
  async createSession(sessionData, options = {}) {
    const collection = await getCollection("negotiation_sessions");
    const result = await collection.insertOne({
      ...sessionData,
      currentRound: 0,
      lastSequence: 0, // Initialize Ordering Track
      status: "active",
      messages: sessionData.messages || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }, options);
    return collection.findOne({ _id: result.insertedId }, options);
  }

  // Find Session By Id
  async findById(sessionId) {
    const collection = await getCollection("negotiation_sessions");
    return collection.findOne({ _id: new ObjectId(sessionId) });
  }

  // Find Active Session For An Order
  async findActiveByOrderId(orderId) {
    const collection = await getCollection("negotiation_sessions");
    return collection.findOne({
      orderId: new ObjectId(orderId),
      status: "active"
    });
  }

  // Atomically Add A Message And Increment Round + Sequence
  async addMessage(sessionId, message, options = {}) {
    const collection = await getCollection("negotiation_sessions");
    return collection.findOneAndUpdate(
      {
        _id: new ObjectId(sessionId),
        status: "active",
        currentRound: { $lt: 6 }, // 6 messages = EXACTLY 3 Full Rounds (Driver x3 + User x3)
        // Enforce Sequence Integrity At Db Level
        lastSequence: { $lt: message.sequence }
      },
      {
        $push: { messages: { ...message, timestamp: new Date() } },
        $inc: { currentRound: 1 },
        $set: {
          updatedAt: new Date(),
          lastSequence: message.sequence
        }
      },
      { returnDocument: "after", ...options }
    );
  }

  // Update Final Status And Close Session (with Re-entrancy Guard)
  async updateStatus(sessionId, status, extraFields = {}, options = {}) {
    const collection = await getCollection("negotiation_sessions");
    return collection.updateOne(
      {
        _id: new ObjectId(sessionId),
        status: { $ne: "accepted" } // Guard: Prevent Multi-Accept Pulses
      },
      {
        $set: {
          status,
          ...extraFields,
          updatedAt: new Date()
        }
      },
      options
    );
  }

  // Find Any Negotiation Session By Order Id (for History/Analytics)
  async findByOrderId(orderId) {
    const collection = await getCollection("negotiation_sessions");
    return collection.findOne({ orderId: new ObjectId(orderId) });
  }
}

module.exports = new NegotiationRepository();
