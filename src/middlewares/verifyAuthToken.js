// This File Handles The Authentication Token Verification Middleware
"use strict";

const { verifyToken } = require("../utils/jwt");
const { Unauthorized, Forbidden } = require("../core/errors/errors");
const UserRepository = require("../modules/user/user.repository");
const logger = require("../utils/logger");

async function verifyAuthToken(req, res, next) {
  try {
    const header = req.headers.authorization || req.headers.Authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw new Unauthorized("Access Token Required!");
    }

    const token = header.split(" ")[1];
    const decoded = verifyToken(token);

    // Re-fetch User From Db For Fresh Role And Status
    const user = await UserRepository.findById(decoded.id);

    if (!user) {
      return next(new Unauthorized("User No Longer Exists!"));
    }

    // Reject Suspended Accounts On Every Protected Request
    if (user.status !== "active") {
      return next(new Forbidden("Account Is Suspended! Please Contact Support."));
    }

    // Invalidate Token If Password Was Changed After It Was Issued
    if (user.passwordChangedAt) {
      const passwordChangedTimestamp = Math.floor(
        new Date(user.passwordChangedAt).getTime() / 1000
      );
      if (decoded.iat < passwordChangedTimestamp) {
        return next(new Unauthorized("Password Changed Recently! Please Log In Again."));
      }
    }

    // Always Use Fresh Db Data For Role
    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    logger.warn({ errName: err.name }, "Token Verification Failed!");

    if (err.name === "TokenExpiredError") {
      return next(new Unauthorized("Session Expired! Please Log In Again."));
    }

    if (err.name === "JsonWebTokenError") {
      return next(new Unauthorized("Invalid Token! Access Denied."));
    }

    next(err instanceof Unauthorized ? err : new Unauthorized("Authentication Failed!"));
  }
}

module.exports = { verifyAuthToken };
