// This File Handles The Notification Routes
const express = require("express");
const router = express.Router();
const NotificationController = require("./notification.controller");

// Send Or Queue Notification To A Specific User
router.post("/send", NotificationController.sendNotification);

// Retrieve Pending Notifications For Testing
router.get("/pending/:userId", NotificationController.getPendingNotifications);

module.exports = router;
