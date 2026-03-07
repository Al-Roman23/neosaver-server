// This File Handles The User Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class UserRepository {
  // Insert A New User Document
  async createUser(userData) {
    const usersCollection = await getCollection("users");
    return usersCollection.insertOne({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Find User By Email Address
  async findByEmail(email) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({ email });
  }

  // Find User By Phone Number
  async findByPhone(phone) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({ phone });
  }

  // Find User By Email Or Phone -> For Login
  async findByEmailOrPhone(email, phone) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({
      $or: [{ email }, { phone }],
    });
  }

  // Find User By Id
  async findById(id) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({ _id: new ObjectId(id) });
  }

  // Update User Fields By Id
  async updateById(id, updateData) {
    const usersCollection = await getCollection("users");
    return usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updateData, updatedAt: new Date() } }
    );
  }

  // Update User Password By Email -> Also Sets Password Changed At For Token Invalidation
  async updatePasswordByEmail(email, hashedPassword) {
    const usersCollection = await getCollection("users");
    return usersCollection.updateOne(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

}

module.exports = new UserRepository();
