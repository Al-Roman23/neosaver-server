// This File Handles The Authentication Routes
const express = require("express");
const router = express.Router();
const AuthController = require("./auth.controller");

// Public Authentication Routes
router.post("/register", AuthController.register);
router.post("/login", AuthController.login);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logout);

module.exports = router;
