// This File Handles The Feedback Routes
const express = require("express");
const router = express.Router();
const FeedbackController = require("./feedback.controller");
const { optionalAuth } = require("../../middlewares/optionalAuth");

// Post Feedback -> Uses Optional Auth To Associate With User If Logged In
router.post("/", optionalAuth, FeedbackController.submitFeedback);

module.exports = router;
