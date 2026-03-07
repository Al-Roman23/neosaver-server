// This File Handles The About Us Routes
const express = require("express");
const router = express.Router();
const AboutController = require("./about.controller");

// Get All About Us Sections
router.get("/", AboutController.getAboutUs);

module.exports = router;
