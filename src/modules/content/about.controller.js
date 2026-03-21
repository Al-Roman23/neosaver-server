// This File Handles The About Us Controller
const AboutService = require("./about.service");

class AboutController {
  // Handle Request To Fetch About Us Sections
  async getAboutUs(req, res, next) {
    try {
      const data = await AboutService.getAboutUs();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AboutController();
