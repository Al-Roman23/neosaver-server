// This File Handles The Terms And Conditions Repository
const { getCollection } = require("../../config/db");

class TermsRepository {
  // Fetch All Terms And Conditions Sections Sorted By Section Number
  async getAllSections() {
    const termsCollection = await getCollection("terms_and_conditions");
    return termsCollection.find({}).sort({ sectionNumber: 1 }).toArray();
  }
}

module.exports = new TermsRepository();
