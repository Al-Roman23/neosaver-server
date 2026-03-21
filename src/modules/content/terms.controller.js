// This File Handles The Terms And Conditions Controller
const TermsService = require("./terms.service");

class TermsController {
  // Handle Request To Fetch Terms And Conditions
  async getTerms(req, res, next) {
    try {
      const data = await TermsService.getTermsAndConditions();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TermsController();
