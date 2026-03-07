// This File Handles The Authentication Persistence (Tokens)
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");

class AuthRepository {
  // Save Password Reset Token
  async saveResetToken(email, token) {
    const resetCollection = await getCollection("reset_tokens");
    // Remove Any Existing Token For This Email First
    await resetCollection.deleteMany({ email });
    return resetCollection.insertOne({ email, token, createdAt: new Date() });
  }

  // Find Reset Token Document
  async findResetToken(token) {
    const resetCollection = await getCollection("reset_tokens");
    return resetCollection.findOne({ token });
  }

  // Delete Reset Token After Use
  async deleteResetToken(token) {
    const resetCollection = await getCollection("reset_tokens");
    return resetCollection.deleteOne({ token });
  }

  // Save Refresh Token
  async saveRefreshToken(userId, token) {
    const refreshCollection = await getCollection("refresh_tokens");
    return refreshCollection.insertOne({
      userId: new ObjectId(userId),
      token,
      createdAt: new Date(),
    });
  }

  // Find Refresh Token Document
  async findRefreshToken(token) {
    const refreshCollection = await getCollection("refresh_tokens");
    return refreshCollection.findOne({ token });
  }

  // Delete Refresh Token -> For Logout Or Rotation
  async deleteRefreshToken(token) {
    const refreshCollection = await getCollection("refresh_tokens");
    return refreshCollection.deleteOne({ token });
  }
}

module.exports = new AuthRepository();
