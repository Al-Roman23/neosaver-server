// This File Handles The Negotiation Routes
const express = require("express");
const router = express.Router();
const NegotiationController = require("./negotiation.controller");
const { verifyAuthToken } = require("../../middlewares/verifyAuthToken");
const { verifyRole } = require("../../middlewares/verifyRole");

// Only Users Can Initiate A Negotiation Handshake
router.post("/initiate", verifyAuthToken, verifyRole(["user"]), NegotiationController.initiate);

module.exports = router;
