// This File Handles The Atomic Sequence Counter For Notifications
const { getCollection } = require("../../config/db");

class SequenceCounterRepository {
  // Generate An Atomic Incrementing Sequence For A Specific Order And Recipient
  async getNextSequence(orderId, recipientId) {
    const collection = await getCollection("sequence_counters");
    const key = `${orderId}_${recipientId}`;

    const result = await collection.findOneAndUpdate(
      { _id: key },
      { $inc: { sequence: 1 } },
      { upsert: true, returnDocument: "after" }
    );

    return result.sequence;
  }
}

module.exports = new SequenceCounterRepository();
