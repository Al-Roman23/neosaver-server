// This File Handles The About Us Service
const AboutRepository = require("./about.repository");

class AboutService {
  // Logic For Getting All About Us Sections
  async getAboutUs() {
    return await AboutRepository.getAllSections();
  }
}

module.exports = new AboutService();
