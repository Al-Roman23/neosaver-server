// This File Handles Profile Routing With Upload Interceptors
const express = require("express");
const router = express.Router();
const multer = require("multer");
const ProfileController = require("./profile.controller");
const { verifyAuthToken } = require("../../middlewares/verifyAuthToken");
const { BadRequest } = require("../../core/errors/errors");

// Configure Multer To Store File Buffers In Memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) { // Allow All Image Types (Png, Jpeg, Webp, Gif)
      cb(null, true);
    } else {
      cb(new BadRequest("Only Image Files Are Allowed!"));
    }
  },
});

// All Routes Below Require Valid Jwt Authentication
router.use(verifyAuthToken);

// Fetch Current User Profile
router.get("/profile", ProfileController.getProfile);

// Partially Update User Profile Fields
router.put("/profile", ProfileController.updateProfile);

// Upload And Replace Profile Image Via Imgbb
router.post("/profile/image", upload.single("image"), ProfileController.uploadProfileImage);

module.exports = router;
