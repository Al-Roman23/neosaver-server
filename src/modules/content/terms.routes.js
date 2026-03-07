// This File Handles The Terms And Conditions Routes
const express = require("express");
const router = express.Router();
const TermsController = require("./terms.controller");

// Get All Terms And Conditions
router.get("/", TermsController.getTerms);

module.exports = router;
