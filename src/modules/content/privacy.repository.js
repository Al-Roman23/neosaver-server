// This File Handles The Privacy Policy Repository
const { getCollection } = require("../../config/db");

class PrivacyRepository {
  // Fetch All Privacy Policy Sections Sorted By Section Number
  async getAllSections() {
    const privacyCollection = await getCollection("privacy_policy");
    return privacyCollection.find({}).sort({ sectionNumber: 1 }).toArray();
  }
}

module.exports = new PrivacyRepository();
