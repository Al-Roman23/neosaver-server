// This File Handles The Partner Routes
const express = require("express");
const router = express.Router();
const PartnerController = require("./partner.controller");
const { verifyAuthToken } = require("../../middlewares/verifyAuthToken");
const { verifyRole } = require("../../middlewares/verifyRole");

// Protected Route -> Partner Initial Registration
router.post("/details", verifyAuthToken, verifyRole(["driver"]), PartnerController.saveDetails);

// Protected Routes -> Partner Profile Management
router.get("/profile", verifyAuthToken, verifyRole(["driver"]), PartnerController.getProfile);
router.put("/profile", verifyAuthToken, verifyRole(["driver"]), PartnerController.updateProfile);
router.patch("/status", verifyAuthToken, verifyRole(["driver"]), PartnerController.updateStatus);

// Configure Multer To Store File Buffers In Memory
const multer = require("multer");
const { BadRequest } = require("../../core/errors/errors");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new BadRequest("Only .jpg And .png Image Files Are Allowed!"));
    }
  },
});

// Protected Route -> Ambulance Image Upload
router.post("/profile/image", verifyAuthToken, verifyRole(["driver"]), upload.single("image"), PartnerController.uploadAmbulanceImage);

// Discovery Route -> Users Can See Available Ambulances
router.get("/list", verifyAuthToken, PartnerController.getAvailablePartners);

module.exports = router;
