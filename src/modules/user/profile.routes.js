// This File Handles Profile Routing With Upload Interceptors
const express = require("express");
const router = express.Router();
const multer = require("multer");
const ProfileController = require("./profile.controller");
const { verifyAuthToken } = require("../../middlewares/verifyAuthToken");
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

// This Applies Authentication Middleware To All Routes Below
router.use(verifyAuthToken);

// This Fetches The Current User Profile
router.get("/profile", ProfileController.getProfile);

// This Updates User Profile Fields Partially
router.put("/profile", ProfileController.updateProfile);

// This Uploads And Replaces The User Profile Image Via Imgbb
router.post("/profile/image", upload.single("image"), ProfileController.uploadProfileImage);

module.exports = router;
