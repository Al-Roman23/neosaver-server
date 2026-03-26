// This File Handles The Jwt Token Generation And Verification
"use strict";

const jwt = require("jsonwebtoken");
const logger = require("./logger");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

if (!JWT_SECRET) {
  logger.fatal("Fatal: Jwt Secret Is Not Set In Environment Variables!");
  process.exit(1);
}

// Generate A Signed Jwt Token From A Given Payload
function generateToken(payload, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Verify A Jwt Token And Return The Decoded Payload
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { generateToken, verifyToken };
