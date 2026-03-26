// This File Handles The Idempotency Key Repository For Deduplication
const { getCollection } = require("../../config/db");

class IdempotencyKeyRepository {
  // Attempt To Create A Non-existent Key (Returns True If New, False If Duplicate)
  async createKey(key) {
    const collection = await getCollection("idempotency_keys");

    // Ensure TTL Index For Automatic 5-Minute Cleanup
    await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 300 });

    try {
      await collection.insertOne({
        _id: key,
        createdAt: new Date(),
      });
      return true; // Key Created Successfully
    } catch (error) {
      // 11000 Is MongoDB Duplicate Key Error Code
      if (error.code === 11000) return false;
      throw error;
    }
  }

  // Check If Key Exists Without Modifying (For Retries Or Lookups)
  async exists(key) {
    const collection = await getCollection("idempotency_keys");
    return collection.findOne({ _id: key });
  }
}

module.exports = new IdempotencyKeyRepository();
