// This File Handles The User Repository
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class UserRepository {
  // This Inserts A New User Document Into The Database
  async createUser(userData) {
    const usersCollection = await getCollection("users");
    return usersCollection.insertOne({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // This Finds A User By Email Address
  async findByEmail(email) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({ email });
  }

  // This Finds A User By Phone Number
  async findByPhone(phone) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({ phone });
  }

  // This Finds A User By Email Or Phone Number For Login
  async findByEmailOrPhone(email, phone) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({
      $or: [{ email }, { phone }],
    });
  }

  // This Finds A User By Unique Identifier
  async findById(id) {
    const usersCollection = await getCollection("users");
    return usersCollection.findOne({ _id: new ObjectId(id) });
  }

  // This Updates User Fields By Unique Identifier
  async updateById(id, updateData) {
    const usersCollection = await getCollection("users");
    return usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updateData, updatedAt: new Date() } }
    );
  }

  // This Updates The User Password And Sets Password Changed Timestamp
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
