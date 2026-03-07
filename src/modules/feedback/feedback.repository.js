// This File Handles The Feedback Repository
const { getCollection } = require("../../config/db");

class FeedbackRepository {
  // Insert A New Feedback Document
  async create(feedbackData) {
    const feedbacksCollection = await getCollection("feedbacks");
    return feedbacksCollection.insertOne({
      ...feedbackData,
      createdAt: new Date(),
    });
  }
}

module.exports = new FeedbackRepository();
