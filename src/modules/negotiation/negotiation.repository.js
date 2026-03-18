// This File Handles The Negotiation Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class NegotiationRepository {
  // Create A New Negotiation Session
  async createSession(sessionData) {
    const collection = await getCollection("negotiation_sessions");
    const result = await collection.insertOne({
      ...sessionData,
      currentRound: 1,
      status: "active",
      messages: sessionData.messages || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return collection.findOne({ _id: result.insertedId });
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

  // Atomically Add A Message And Increment Round
  async addMessage(sessionId, message) {
    const collection = await getCollection("negotiation_sessions");
    return collection.findOneAndUpdate(
      { _id: new ObjectId(sessionId), status: "active", currentRound: { $lt: 3 } },
      { 
        $push: { messages: { ...message, timestamp: new Date() } },
        $inc: { currentRound: 1 },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: "after" }
    );
  }

  // Update Final Status And Close Session
  async updateStatus(sessionId, status, extraFields = {}) {
    const collection = await getCollection("negotiation_sessions");
    return collection.updateOne(
      { _id: new ObjectId(sessionId) },
      { 
        $set: { 
          status, 
          ...extraFields, 
          updatedAt: new Date() 
        } 
      }
    );
  }
}

module.exports = new NegotiationRepository();
