// This File Handles The Partner Controller
const PartnerService = require("./partner.service");

class PartnerController {
  // Save Partner Details
  async saveDetails(req, res, next) {
    try {
      const userId = req.user.id;
      await PartnerService.registerPartner(userId, req.body);

      res.status(201).json({
        success: true,
        message: "Partner Details Submitted Successfully!",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Unified Partner Profile (users + Partners Data)
  async getProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await PartnerService.getPartnerProfile(userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Handle Partial Profile Updates Across Collections
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const { validatePartnerProfileUpdate } = require("./partner.validator");

      validatePartnerProfileUpdate(req.body);
      const updatedProfile = await PartnerService.updatePartnerProfile(userId, req.body);

      res.status(200).json({
        success: true,
        message: "Partner Profile Updated Successfully!",
        data: updatedProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Toggle Driver Online Status Specifically
  async updateStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const { validateStatusUpdate } = require("./partner.validator");

      validateStatusUpdate(req.body);
      const updatedProfile = await PartnerService.updateStatus(userId, req.body.currentStatus);

      res.status(200).json({
        success: true,
        message: "Status Updated Successfully!",
        data: updatedProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Handle Imgbb Ambulance Image Upload
  async uploadAmbulanceImage(req, res, next) {
    try {
      const userId = req.user.id;
      const file = req.file;

      if (!file) {
        throw new Error("No File Provided For Upload!");
      }

      const updatedProfile = await PartnerService.uploadAmbulanceImage(userId, file.buffer, file.originalname);

      res.status(200).json({
        success: true,
        message: "Ambulance Image Uploaded Successfully!",
        data: updatedProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get List Of All Available Ambulances
  async getAvailablePartners(req, res, next) {
    try {
      const partners = await PartnerService.getAllAvailablePartners();

      res.status(200).json({
        success: true,
        data: partners,
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify Partner Identity (admin Action)
  async verifyPartner(req, res, next) {
    try {
      const { id: partnerId } = req.params;
      const { isVerified } = req.body;
      const PartnerRepository = require("./partner.repository");

      const updated = await PartnerRepository.verifyPartner(partnerId, isVerified);
      if (updated.matchedCount === 0) throw new Error("Partner Not Found!");

      res.status(200).json({
        success: true,
        message: `Partner Verification Status Changed To ${isVerified}`,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PartnerController();
