// This File Handles The Terms And Conditions Service
const TermsRepository = require("./terms.repository");

class TermsService {
  // Logic For Getting All Terms And Conditions
  async getTermsAndConditions() {
    const sections = await TermsRepository.getAllSections();
    return sections;
  }
}

module.exports = new TermsService();
