// This File Handles The Privacy Policy Service
const PrivacyRepository = require("./privacy.repository");

class PrivacyService {
  // Logic For Getting All Privacy Policy Sections
  async getPrivacyPolicy() {
    return await PrivacyRepository.getAllSections();
  }
}

module.exports = new PrivacyService();
