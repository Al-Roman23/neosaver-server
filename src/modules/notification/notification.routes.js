// This File Maps The Notification Endpoints For The Elite Event Delivery Engine
const express = require("express");
const router = express.Router();
const NotificationController = require("./notification.controller");

// Dispatches A Mission-critical Notification To Specific Users
router.post("/send", NotificationController.sendNotification);

// Retrieves Persistent Notification Log And Audit History For Dashboard
router.get("/history/:userId", NotificationController.getHistory);

module.exports = router;
