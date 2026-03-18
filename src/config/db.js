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

    // Users Collection Indexes
    const usersCollection = db.collection("users");
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ phone: 1 }, { unique: true });

    // Reset Tokens Collection Indexes -> TTL: Auto-Expire After 1 Hour
    const resetTokensCollection = db.collection("reset_tokens");
    await resetTokensCollection.createIndex({ email: 1 });
    await resetTokensCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 3600 }
    );

    // Nonce Registry (Distributed Replay Protection)
    const noncesCollection = db.collection("nonces");
    await noncesCollection.createIndex({ nonce: 1 }, { unique: true });
    await noncesCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 600 } // 10-Min TTL
    );

    // Distributed Worker Lock (Ensures Only One In-Flight Reconciliation)
    const workerLocksCollection = db.collection("worker_locks");
    await workerLocksCollection.createIndex({ lockKey: 1 }, { unique: true });
    await workerLocksCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 60 } // Safety Release
    );

    // Ambulance Partners Collection Indexes
    const partnersCollection = db.collection("partners");
    await partnersCollection.createIndex({ email: 1 }, { unique: true });
    await partnersCollection.createIndex({ userId: 1 }, { unique: true });
    await partnersCollection.createIndex({ location: "2dsphere" });
    // Optimized Compound Index For Discovery
    await partnersCollection.createIndex({ isOnline: 1, currentOrderId: 1, isAvailable: 1, isNegotiating: 1 });
    
    // Index For Negotiation Locking & Stale Lock Cleanup
    await partnersCollection.createIndex(
      { isNegotiating: 1 },
      { partialFilterExpression: { isNegotiating: true } }
    );
    await partnersCollection.createIndex({ negotiationLockExpiresAt: 1 });

    // Refresh Tokens Collection Indexes -> TTL: 30 Days
    const refreshTokensCollection = db.collection("refresh_tokens");
    await refreshTokensCollection.createIndex({ token: 1 });
    await refreshTokensCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60 }
    );
    
    // Negotiation Sessions Collection Indexes
    const negotiationCollection = db.collection("negotiation_sessions");
    await negotiationCollection.createIndex({ orderId: 1, currentRound: -1 });
    await negotiationCollection.createIndex({ status: 1, expiresAt: 1 });
    await negotiationCollection.createIndex({ userId: 1, status: 1 }); // Quick Active Lookups

    // Feedbacks Collection Index
    const feedbacksCollection = db.collection("feedbacks");
    await feedbacksCollection.createIndex({ createdAt: 1 });

    // Terms And Conditions Collection Index -> Unique Section Numbers
    const termsCollection = db.collection("terms_and_conditions");
    await termsCollection.createIndex({ sectionNumber: 1 }, { unique: true });

    // Privacy Policy Collection Index -> Unique Section Numbers
    const privacyCollection = db.collection("privacy_policy");
    await privacyCollection.createIndex({ sectionNumber: 1 }, { unique: true });

    // About Us Collection Index -> Unique Section Numbers
    const aboutCollection = db.collection("about_us");
    await aboutCollection.createIndex({ sectionNumber: 1 }, { unique: true });

    // Offline Notifications Collection Indexes -> Optimize Pending Queue Search
    const offlineNotificationsCollection = db.collection("offline_notifications");
    await offlineNotificationsCollection.createIndex({ userId: 1, delivered: 1 });

    // Analytics & Penalty Collection Indexes
    const analyticsCollection = db.collection("negotiation_analytics");
    await analyticsCollection.createIndex({ driverId: 1, timestamp: -1 });
    await analyticsCollection.createIndex({ orderId: 1 });

    const penaltiesCollection = db.collection("driver_penalties");
    await penaltiesCollection.createIndex({ driverId: 1, timestamp: -1 });

    // Orders Collection Indexes -> Optimize Dispatch And History Queries
    const ordersCollection = db.collection("orders");
    await ordersCollection.createIndex({ userId: 1, status: 1 }); // Compound Success Lookup
    await ordersCollection.createIndex({ partnerId: 1, status: 1 }); 
    await ordersCollection.createIndex({ status: 1 });
    await ordersCollection.createIndex({ status: 1, createdAt: -1 });
    await ordersCollection.createIndex({ pickupLocation: "2dsphere" });
    // Index For Optimistic Concurrency Control And Negotiation Lookups
    await ordersCollection.createIndex({ version: 1 });
    await ordersCollection.createIndex({ negotiationId: 1 });
  } catch (err) {
    logger.fatal({ err }, "Failed To Ensure Database Indexes!");
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
