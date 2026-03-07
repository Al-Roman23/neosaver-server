// This File Handles The Privacy Policy Controller
const PrivacyService = require("./privacy.service");

class PrivacyController {
  // Handle Request To Fetch Privacy Policy
  async getPrivacyPolicy(req, res, next) {
    try {
      const data = await PrivacyService.getPrivacyPolicy();
      
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PrivacyController();
