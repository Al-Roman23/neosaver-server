// This File Handles Optional Authentication Middleware
// It Attaches User Info To Req If Token Is Valid, Otherwise Continues
"use strict";

const { verifyToken } = require("../utils/jwt");
const UserRepository = require("../modules/user/user.repository");
const logger = require("../utils/logger");

async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || req.headers.Authorization;

    // If No Auth Header, Just Continue
    if (!header || !header.startsWith("Bearer ")) {
      return next();
    }

    const token = header.split(" ")[1];

    // Verify Token Signature And Expiration
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      // If Token Is Invalid, We Don't Throw Error, Just Continue Without User
      // Note: This Might Be Changeable Based On Security Requirements
      // But For Optional Auth, We Usually Just Ignore Invalid Tokens
      return next();
    }

    // Re-fetch User From Db For Fresh Role And Status
    const user = await UserRepository.findById(decoded.id);

    // If User Exists And Is Active, Attach To Request
    if (user && user.status === "active") {
      req.user = {
        id: user._id,
        email: user.email,
        role: user.role,
      };
    }

    next();
  } catch (err) {
    // Log Error But Don't Block The Request
    logger.warn({ errName: err.name }, "Optional Token Verification Had An Internal Error!");
    next();
  }
}

module.exports = { optionalAuth };
