// This File Handles Profile Route Responses
const ProfileService = require("./profile.service");
const { validateProfileUpdate } = require("./profile.validator");
const { BadRequest } = require("../../core/errors/errors");

class ProfileController {
  // This Handles The Http Request To Fetch The User Profile
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

  // This Handles The Http Request To Update User Profile Fields
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const updateData = req.body;

      // This Validates The Incoming Profile Update Payload
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

  // This Handles The Http Request To Upload And Update Profile Image
  async uploadProfileImage(req, res, next) {
    try {
      const userId = req.user.id;
      const file = req.file; // This File Is Provided By Multer Middleware

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
