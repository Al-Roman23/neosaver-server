// This File Handles The Partner Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class PartnerRepository {
  // Create A New Partner Record
  async createPartner(partnerData) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.insertOne({
      ...partnerData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async findByUserId(userId) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.findOne({ userId: new ObjectId(userId) });
  }

  // Update Partner Status And Availability
  async updateStatus(userId, isAvailable, currentStatus) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { isAvailable, currentStatus, updatedAt: new Date() } }
    );
  }

  // Partially Update Partner Fields By User Id
  async updateByUserId(userId, updateData) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { ...updateData, updatedAt: new Date() } }
    );
  }

  // Update Driver Geojson Location Vector
  async updateDriverLocation(userId, lng, lat) {
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
      }
    );
  }

  // Atomically Lock Driver To An Order (Prevents Double-booking)
  async lockDriver(userId, orderId) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId), currentOrderId: null }, // Guard
      { $set: { currentOrderId: new ObjectId(orderId), updatedAt: new Date() } }
    );
  }

  // Unlock Driver After Trip Is Completed Or Cancelled
  async unlockDriver(userId) {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { currentOrderId: null, updatedAt: new Date() } }
    );
  }

  // Find All Partners Who Are Currently Available
  async findAllAvailable() {
    const partnersCollection = await getCollection("partners");
    return partnersCollection.find({ isAvailable: true }).toArray();
  }
}

module.exports = new PartnerRepository();
