// This File Handles The Database Connection
const { MongoClient, ServerApiVersion } = require("mongodb");
const logger = require("../utils/logger");
require("dotenv").config();

// Fail Fast If Required Environment Variables Are Missing
["DB_USER", "DB_PASS", "DB_NAME"].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing Required Environment Variable: ${key}!`);
  }
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d1tjpss.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
});

let dbInstance = null;

async function connectDB() {
  if (dbInstance) return dbInstance;

  try {
    await client.connect();
    dbInstance = client.db(process.env.DB_NAME);
    return dbInstance;
  } catch (err) {
    logger.error({ err }, "MongoDB Connection Failed!");
    throw err;
  }
}

async function ensureIndexes() {
  try {
    const db = await connectDB();
    const results = [];

    const safeIndex = async (collectionName, keys, options = {}) => {
      try {
        await db.collection(collectionName).createIndex(keys, options);
        results.push(`✅ [${collectionName}] Index ${JSON.stringify(keys)} Created!`);
      } catch (err) {
        results.push(`❌ [${collectionName}] Index ${JSON.stringify(keys)} FAILED: ${err.message}`);
        logger.error({ err, collectionName, keys }, "Index Creation Error");
      }
    };

    // 1. Users
    await safeIndex("users", { email: 1 }, { unique: true });
    await safeIndex("users", { phone: 1 }, { unique: true });

    // 2. Auth Tokens
    await safeIndex("reset_tokens", { email: 1 });
    await safeIndex("reset_tokens", { createdAt: 1 }, { expireAfterSeconds: 3600 });
    await safeIndex("refresh_tokens", { token: 1 });
    await safeIndex("refresh_tokens", { createdAt: 1 }, { expireAfterSeconds: 2592000 });

    // 3. Security (Nonces)
    await safeIndex("nonces", { nonce: 1 }, { unique: true });
    await safeIndex("nonces", { createdAt: 1 }, { expireAfterSeconds: 600 });

    // 4. Concurrency (Worker Locks)
    await safeIndex("worker_locks", { lockKey: 1 }, { unique: true });
    await safeIndex("worker_locks", { createdAt: 1 }, { expireAfterSeconds: 60 });

    // 5. MISSION CRITICAL: Partners (Geo + Locking)
    await safeIndex("partners", { email: 1 }, { unique: true });
    await safeIndex("partners", { userId: 1 }, { unique: true });
    await safeIndex("partners", { location: "2dsphere" });
    await safeIndex("partners", { isOnline: 1, currentOrderId: 1, isAvailable: 1, isNegotiating: 1 });
    await safeIndex("partners", { isNegotiating: 1 }, { partialFilterExpression: { isNegotiating: true } });
    await safeIndex("partners", { negotiationLockExpiresAt: 1 });

    // 6. Negotiation Sessions
    await safeIndex("negotiation_sessions", { orderId: 1, currentRound: -1 });
    await safeIndex("negotiation_sessions", { status: 1, expiresAt: 1 });
    await safeIndex("negotiation_sessions", { userId: 1, status: 1 });

    // 7. Orders (Geo + Performance)
    await safeIndex("orders", { userId: 1, status: 1 });
    await safeIndex("orders", { partnerId: 1, status: 1 });
    await safeIndex("orders", { status: 1, createdAt: -1 });
    await safeIndex("orders", { pickupLocation: "2dsphere" });
    await safeIndex("orders", { version: 1 });
    await safeIndex("orders", { negotiationId: 1 });

    // 8. Public Content & Feedbacks
    await safeIndex("feedbacks", { createdAt: 1 });
    await safeIndex("terms_and_conditions", { sectionNumber: 1 }, { unique: true });
    await safeIndex("privacy_policy", { sectionNumber: 1 }, { unique: true });
    await safeIndex("about_us", { sectionNumber: 1 }, { unique: true });
    await safeIndex("offline_notifications", { userId: 1, delivered: 1 });

    // 9. Analytics
    await safeIndex("negotiation_analytics", { driverId: 1, timestamp: -1 });
    await safeIndex("negotiation_analytics", { orderId: 1 });
    await safeIndex("driver_penalties", { driverId: 1, timestamp: -1 });

    logger.info("--- DATABASE INDEX PROVISIONING REPORT ---");
    results.forEach(msg => logger.info(msg));
    logger.info("------------------------------------------");
    
  } catch (err) {
    logger.fatal({ err }, "Fatal Database Initialization Failure!");
    throw err;
  }
}

async function getCollection(name) {
  const db = await connectDB();
  return db.collection(name);
}

module.exports = {
  connectDB,
  ensureIndexes,
  getCollection,
  client,
};
