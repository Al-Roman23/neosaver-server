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

// Active Management Phase (Shared Lifecycle)
router.get("/active", verifyAuthToken, verifyRole(["user", "driver"]), OrderController.getActiveOrder);
router.get("/history", verifyAuthToken, verifyRole(["user", "driver"]), OrderController.getOrderHistory);
router.delete("/:id", verifyAuthToken, verifyRole(["user", "driver"]), OrderController.cancelOrder);

// Driver Action Flow Phase
router.patch("/:id/arrived", verifyAuthToken, verifyRole(["driver"]), OrderController.markArrived);
router.patch("/:id/start", verifyAuthToken, verifyRole(["driver"]), OrderController.startTrip);
router.patch("/:id/complete", verifyAuthToken, verifyRole(["driver"]), OrderController.completeTrip);

module.exports = router;
