// This File Handles The Feedback Controller
const FeedbackService = require("./feedback.service");
const { validateFeedback } = require("./feedback.validator");

class FeedbackController {
  // Handle Feedback Submission Request
  async submitFeedback(req, res, next) {
    try {
      // Validate Input Fields
      validateFeedback(req.body);

      // Extract User Id If Available From Optional Auth Middleware
      const userId = req.user ? req.user.id : null;

      // Process Submission Via Service
      await FeedbackService.submitFeedback(req.body, userId);

      res.status(201).json({
        success: true,
        message: "Feedback Submitted Successfully!",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FeedbackController();
