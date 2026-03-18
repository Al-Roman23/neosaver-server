// This File Aggregates All Version 1 Routes Modularly
const express = require("express");
const router = express.Router();

const authRoutes = require("../modules/auth/auth.routes");
const partnerRoutes = require("../modules/partner/partner.routes");
const feedbackRoutes = require("../modules/feedback/feedback.routes");
const termsRoutes = require("../modules/content/terms.routes");
const privacyRoutes = require("../modules/content/privacy.routes");
const aboutRoutes = require("../modules/content/about.routes");
const notificationRoutes = require("../modules/notification/notification.routes");
const userProfileRoutes = require("../modules/user/profile.routes");
const orderRoutes = require("../modules/order/order.routes");
const negotiationRoutes = require("../modules/negotiation/negotiation.routes");

// Mount Individual Routes Under The V1 Router
router.use("/auth", authRoutes);
router.use("/partner", partnerRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/terms-conditions", termsRoutes);
router.use("/privacy-policy", privacyRoutes);
router.use("/about-us", aboutRoutes);
router.use("/notifications", notificationRoutes);
router.use("/user", userProfileRoutes);
router.use("/orders", orderRoutes);
router.use("/negotiations", negotiationRoutes);

module.exports = router;
