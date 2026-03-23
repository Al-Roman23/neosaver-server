// This File Handles The Partner Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class PartnerRepository {
  // Create A New Partner Record
  async createPartner(partnerData) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.insertOne({
      ...partnerData,
      isVerified: true, // Security: Driver Must Be Manually Approved To Be Queried
      isNegotiating: false, // Core: Always Initialize As False
      negotiationLockExpiresAt: null,
      isAppInBackground: false, // Core: Manage Background Grace Period
      lastAppHeartbeatAt: new Date(), // Core: Dead Man's Switch Pulse
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async findByUserId(userId) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.findOne({ userId: new ObjectId(userId) });
  }

  // Update App Heartbeat To Support Graceful Persistence
  async updateHeartbeat(userId) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { lastAppHeartbeatAt: new Date(), updatedAt: new Date() } }
    );
  }

  // Update Partner Status And Availability
  async updateStatus(userId, isAvailable, currentStatus, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { isAvailable, currentStatus, updatedAt: new Date() } },
      options
    );
  }

  // Verify A Partner Manually (admin Only)
  async verifyPartner(partnerId, isVerified = true, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { _id: new ObjectId(partnerId) },
      { $set: { isVerified, updatedAt: new Date() } },
      options
    );
  }

  // Partially Update Partner Fields By User Id
  async updateByUserId(userId, updateData, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { ...updateData, updatedAt: new Date() } },
      options
    );
  }

  // Update Driver Geojson Location Vector
  async updateDriverLocation(userId, lng, lat, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId), isOnline: true },
      {
        $set: {
          location: {
            type: "Point",
            coordinates: [lng, lat],
          },
          lastLocationUpdate: new Date(),
          updatedAt: new Date(),
        },
      },
      options
    );
  }

  // Atomically Lock Driver For A Negotiation Session (Prevents Double-negotiation)
  async lockForNegotiation(userId, timeoutMs = 60000, options = {}) {
    const partnersCollection = await getCollection("partners");
    const expiresAt = new Date(Date.now() + timeoutMs);

    return partnersCollection.findOneAndUpdate(
      {
        userId: new ObjectId(userId),
        currentOrderId: null,      // Must Not Be On A Trip
        isNegotiating: { $ne: true } // Must Not Be Negotiating Already
      },
      {
        $set: {
          isNegotiating: true,
          negotiationLockExpiresAt: expiresAt,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after", ...options }
    );
  }

  // Explicitly Release Driver From Negotiation Lock
  async unlockFromNegotiation(userId, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      {
        $set: {
          isNegotiating: false,
          isAvailable: true, // Restore Bidding Presence In Discovery Pool
          negotiationLockExpiresAt: null,
          updatedAt: new Date()
        }
      },
      options
    );
  }

  // Clear Stale Negotiation Locks (Called By Background Worker)
  async clearStaleLocks(options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateMany(
      {
        isNegotiating: true,
        negotiationLockExpiresAt: { $lt: new Date() }
      },
      {
        $set: {
          isNegotiating: false,
          negotiationLockExpiresAt: null,
          updatedAt: new Date()
        }
      },
      options
    );
  }

  // Atomically Lock Driver To An Order (Prevents Double-booking)
  async lockDriver(userId, orderId, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId), currentOrderId: null }, // Guard
      {
        $set: {
          currentOrderId: new ObjectId(orderId),
          isNegotiating: false, // Release Negotiation Lock If Finalized
          negotiationLockExpiresAt: null,
          updatedAt: new Date()
        }
      },
      options
    );
  }

  // Unlock Driver After Trip Is Completed Or Cancelled
  async unlockDriver(userId, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      {
        $set: {
          currentOrderId: null,
          isNegotiating: false,
          isAvailable: true, // Restore Experience Point In Search Pool
          updatedAt: new Date()
        }
      },
      options
    );
  }

  // Find All Partners Who Are Currently Available
  async findAllAvailable() {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.find({ isAvailable: true, isVerified: true }).toArray();
  }

  // Increment Successful Trip Counter For A Specific Driver
  async incrementTrips(userId, options = {}) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      {
        $inc: { totalTrips: 1 },
        $set: { updatedAt: new Date() }
      },
      options
    );
  }
}

module.exports = new PartnerRepository();
