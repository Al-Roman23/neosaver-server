// This File Handles The Order Routes
const express = require("express");
const router = express.Router();
const OrderController = require("./order.controller");
const { verifyAuthToken } = require("../../middlewares/verifyAuthToken");
const { verifyRole } = require("../../middlewares/verifyRole");

// User Routes -> Authenticated Users Only
router.post("/", verifyAuthToken, verifyRole(["user"]), OrderController.createOrder);
router.get("/active", verifyAuthToken, verifyRole(["user"]), OrderController.getActiveOrder);
router.get("/history", verifyAuthToken, verifyRole(["user"]), OrderController.getOrderHistory);
router.delete("/:id", verifyAuthToken, verifyRole(["user"]), OrderController.cancelOrder);

// Driver Workflow Routes -> Authenticated Drivers Only
router.patch("/:id/arrived", verifyAuthToken, verifyRole(["driver"]), OrderController.arrived);
router.patch("/:id/start", verifyAuthToken, verifyRole(["driver"]), OrderController.startTrip);
router.patch("/:id/complete", verifyAuthToken, verifyRole(["driver"]), OrderController.completeTrip);
router.get("/partner/active", verifyAuthToken, verifyRole(["driver"]), OrderController.getActiveOrderByPartner);
router.get("/partner/history", verifyAuthToken, verifyRole(["driver"]), OrderController.getOrderHistoryByPartner);

module.exports = router;
