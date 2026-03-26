// This File Handles The Partner Routes
const express = require("express");
const router = express.Router();
const multer = require("multer");
const PartnerController = require("./partner.controller");
const { verifyAuthToken } = require("../../middlewares/verifyAuthToken");
const { verifyRole } = require("../../middlewares/verifyRole");
const { BadRequest } = require("../../core/errors/errors");

// This Configures Multer To Store File Buffers In Memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // This Sets The Maximum File Size Limit To 5 Mb
  fileFilter: (req, file, cb) => {
    const isImageMime = file.mimetype.startsWith("image/");
    const isImageExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname);

    if (isImageMime || isImageExt) {
      cb(null, true);
    } else {
      cb(new BadRequest("Only Image Files Are Allowed!"));
    }
  },
});

// Protected Route -> Partner Initial Registration
router.post("/details", verifyAuthToken, verifyRole(["driver"]), PartnerController.saveDetails);

// Protected Routes -> Partner Profile Management
router.get("/profile", verifyAuthToken, verifyRole(["driver"]), PartnerController.getProfile);
router.put("/profile", verifyAuthToken, verifyRole(["driver"]), PartnerController.updateProfile);
router.patch("/status", verifyAuthToken, verifyRole(["driver"]), PartnerController.updateStatus);
router.patch("/profile/location", verifyAuthToken, verifyRole(["driver"]), PartnerController.updateLocation);

// Admin Route -> Verify Driver Manually
router.patch("/:id/verify", verifyAuthToken, verifyRole(["admin"]), PartnerController.verifyPartner);

// Protected Route -> Ambulance Image Upload
router.post("/profile/image", verifyAuthToken, verifyRole(["driver"]), upload.single("image"), PartnerController.uploadAmbulanceImage);

// Discovery Route -> Users Can See Available Ambulances
router.get("/list", verifyAuthToken, PartnerController.getAvailablePartners);

module.exports = router;
