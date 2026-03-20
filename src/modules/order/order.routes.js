// This File Handles The Order Routes
const express = require("express");
const router = express.Router();
const OrderController = require("./order.controller");
const { verifyAuthToken } = require("../../middlewares/verifyAuthToken");
const { verifyRole } = require("../../middlewares/verifyRole");

// User Routes -> Authenticated Users Only
// Discovery & Selection Phase
router.get("/nearby", verifyAuthToken, verifyRole(["user"]), OrderController.getNearbyDrivers);
router.post("/", verifyAuthToken, verifyRole(["user"]), OrderController.createOrder);

// Active Management Phase (User)
router.get("/active", verifyAuthToken, verifyRole(["user"]), OrderController.getActiveOrder);
router.get("/history", verifyAuthToken, verifyRole(["user"]), OrderController.getOrderHistory);
router.get("/:id", verifyAuthToken, OrderController.getOrderDetails);
router.delete("/:id", verifyAuthToken, verifyRole(["user", "driver"]), OrderController.cancelOrder);

// Active Management Phase (Driver Shared Tracking)
router.get("/partner/active", verifyAuthToken, verifyRole(["driver"]), OrderController.getActiveOrderByPartner);
router.get("/partner/history", verifyAuthToken, verifyRole(["driver"]), OrderController.getOrderHistoryByPartner);

// Driver Action Flow Phase
router.patch("/:id/arrived", verifyAuthToken, verifyRole(["driver"]), OrderController.markArrived);
router.patch("/:id/start", verifyAuthToken, verifyRole(["driver"]), OrderController.startTrip);
router.patch("/:id/complete", verifyAuthToken, verifyRole(["driver"]), OrderController.completeTrip);

module.exports = router;
