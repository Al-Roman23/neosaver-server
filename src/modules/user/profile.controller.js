// This File Handles Profile Route Responses
const ProfileService = require("./profile.service");
const { validateProfileUpdate } = require("./profile.validator");
const { BadRequest } = require("../../core/errors/errors");

class ProfileController {
  // Http Fetch Profile
  async getProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const userProfile = await ProfileService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Http Update Profile Fields
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const updateData = req.body;

      // Validate Incoming Payload
      validateProfileUpdate(updateData);

      const updatedProfile = await ProfileService.updateProfile(userId, updateData);

      res.status(200).json({
        success: true,
        message: "Profile Updated Successfully!",
        data: updatedProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Http Upload Image To Imgbb And Set Url
  async uploadProfileImage(req, res, next) {
    try {
      const userId = req.user.id;
      const file = req.file; // Provided By Multer

      if (!file) {
        throw new BadRequest("No File Provided For Upload!");
      }

      const updatedProfile = await ProfileService.uploadProfileImage(
        userId,
        file.buffer,
        file.originalname
      );

      res.status(200).json({
        success: true,
        message: "Profile Image Uploaded Successfully!",
        data: updatedProfile,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProfileController();
