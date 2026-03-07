// This File Handles The Feedback Service
const FeedbackRepository = require("./feedback.repository");
const logger = require("../../utils/logger");

class FeedbackService {
  // Logic For Submitting Feedback
  async submitFeedback(data, userId = null) {
    const feedbackData = {
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      rating: Number(data.rating),
      feedback: data.feedback.trim(),
      userId: userId || null,
    };

    const result = await FeedbackRepository.create(feedbackData);
    
    logger.info({ feedbackId: result.insertedId }, "New Feedback Received!");
    
    return result;
  }
}

module.exports = new FeedbackService();
