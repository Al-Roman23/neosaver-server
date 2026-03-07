// This File Handles The About Us Repository
const { getCollection } = require("../../config/db");

class AboutRepository {
  // Fetch All About Us Sections Sorted By Section Number
  async getAllSections() {
    const aboutCollection = await getCollection("about_us");
    return aboutCollection.find({}).sort({ sectionNumber: 1 }).toArray();
  }
}

module.exports = new AboutRepository();
