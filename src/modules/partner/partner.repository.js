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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async findByUserId(userId) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.findOne({ userId: new ObjectId(userId) });
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

  // Verify A Partner Manually (Admin Only)
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
}

module.exports = new PartnerRepository();
