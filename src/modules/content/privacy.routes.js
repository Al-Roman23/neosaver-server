// This File Handles The Privacy Policy Routes
const express = require("express");
const router = express.Router();
const PrivacyController = require("./privacy.controller");

// Get All Privacy Policy Sections
router.get("/", PrivacyController.getPrivacyPolicy);

module.exports = router;
