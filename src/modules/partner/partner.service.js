// This File Handles The Partner Service Logic
const PartnerRepository = require("./partner.repository");
const { ALLOWED_USER_FIELDS, ALLOWED_PARTNER_FIELDS, validatePartnerDetails } = require("./partner.validator");
const UserRepository = require("../user/user.repository");
const OrderRepository = require("../order/order.repository");
const { uploadImageToImgBB } = require("../../utils/imgbb");
const { Conflict, NotFound } = require("../../core/errors/errors");
const { getCollection } = require("../../config/db");

class PartnerService {
  async registerPartner(userId, details) {
    // Validate Input Fields
    validatePartnerDetails(details);

    // Check If Partner Already Registered
    const existingPartner = await PartnerRepository.findByUserId(userId);
    if (existingPartner) {
      throw new Conflict("You Have Already Submitted Your Partner Details!");
    }

    // Check Uniqueness For Mission-critical Documents (nid & License)
    const partnersCollection = await getCollection("partners");

    const nidExists = await partnersCollection.findOne({ nationalId: details.nationalId });
    if (nidExists) {
      throw new Conflict("This National ID (NID) Is Already Registered To Another Driver!");
    }

    const licenseExists = await partnersCollection.findOne({ driverLicenseNumber: details.licenseNumber });
    if (licenseExists) {
      throw new Conflict("This Driver License Number Is Already Registered!");
    }

    const partnerData = {
      userId,
      ambulanceType: details.ambulanceType,
      driverLicenseNumber: details.licenseNumber,
      roadTaxToken: details.roadTaxToken,
      nationalId: details.nationalId,
      vehicleNumber: details.vehicleNumber,
      referenceId: details.referenceId || null,
      coverageArea: details.coverageArea,
      contactNumber: details.contactNumber,
      email: details.email.toLowerCase().trim(),
      hospitalOrCompanyName: details.companyName,
      isAvailable: true,
      isOnline: true,
      currentStatus: "online",
      currentOrderId: null,
      isNegotiating: false,
      negotiationLockExpiresAt: null,
      ambulanceImageUrl: null,
      location: null,
      lastLocationUpdate: null,
      lastSocketConnectedAt: null,
      rating: 0,
      totalTrips: 0,
    };

    return PartnerRepository.createPartner(partnerData);
  }

  // Get Combined Details From User And Partner Collections
  async getPartnerProfile(userId) {
    const user = await UserRepository.findById(userId);
    const partner = await PartnerRepository.findByUserId(userId);

    if (!user) {
      throw new NotFound("User Record Could Not Be Found!");
    }

    // [TEMPORARY HACK FOR FRONTEND TESTING] Return Null If Partner Doesn't Exist Yet
    if (!partner) {
      return null;
    }

    // Assemble The Required Output Structure With Null-Safety For Un-Onboarded Partners
    return {
      personalInfo: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
        createdAt: user.createdAt,
      },
      partnerInfo: partner ? {
        ambulanceType: partner.ambulanceType,
        vehicleNumber: partner.vehicleNumber,
        driverLicenseNumber: partner.driverLicenseNumber,
        roadTaxToken: partner.roadTaxToken,
        nationalId: partner.nationalId,
        referenceId: partner.referenceId,
        coverageArea: partner.coverageArea,
        contactNumber: partner.contactNumber,
        hospitalOrCompanyName: partner.hospitalOrCompanyName,
        currentStatus: partner.currentStatus,
        isAvailable: partner.isAvailable,
        isOnline: partner.isOnline,
        currentOrderId: partner.currentOrderId,
        ambulanceImageUrl: partner.ambulanceImageUrl,
        location: partner.location,
        lastLocationUpdate: partner.lastLocationUpdate,
        lastSocketConnectedAt: partner.lastSocketConnectedAt,
        rating: partner.rating,
        completedOrderCount: await OrderRepository.countCompletedByPartnerId(userId),
        createdAt: partner.createdAt,
        updatedAt: partner.updatedAt,
      } : null,
    };
  }

  // Handle Split Partial Update Safely
  async updatePartnerProfile(userId, updateData) {
    const userUpdates = {};
    const partnerUpdates = {};

    // Sort Fields Into Respective Update Payloads
    for (const [key, value] of Object.entries(updateData)) {
      if (ALLOWED_USER_FIELDS.includes(key)) userUpdates[key] = value;
      if (ALLOWED_PARTNER_FIELDS.includes(key)) partnerUpdates[key] = value;
    }

    // Process Users Collection Update (including Unique Email/phone Check)
    if (Object.keys(userUpdates).length > 0) {
      const user = await UserRepository.findById(userId);

      if (userUpdates.email && userUpdates.email !== user.email) {
        const emailExists = await UserRepository.findByEmail(userUpdates.email);
        if (emailExists) {
          throw new Conflict("Email Address Is Already In Use By Another Account!");
        }
      }

      if (userUpdates.phone && userUpdates.phone !== user.phone) {
        const phoneExists = await UserRepository.findByPhone(userUpdates.phone);
        if (phoneExists) {
          throw new Conflict("Phone Number Is Already In Use By Another Account!");
        }
      }

      await UserRepository.updateById(userId, userUpdates);
    }

    // Process Partners Collection Update
    if (Object.keys(partnerUpdates).length > 0) {
      await PartnerRepository.updateByUserId(userId, partnerUpdates);
    }

    // Return The Fully Resolved, Clean Profile Tree
    return await this.getPartnerProfile(userId);
  }

  // Handle Standalone Status Updating
  async updateStatus(userId, currentStatus) {
    const partner = await PartnerRepository.findByUserId(userId);
    if (!partner) {
      throw new Conflict("Partner Record Could Not Be Found!");
    }

    // Status Drives True Online/offline Maps Logic -> We Link Isavailable Automatically
    const isAvailable = currentStatus === "online";
    const isOnline = currentStatus === "online";
    await PartnerRepository.updateByUserId(userId, { currentStatus, isAvailable, isOnline });

    return await this.getPartnerProfile(userId);
  }

  // Handle Manual GPS Location Update Via HTTP API
  async updateLocation(userId, latitude, longitude) {
    const partner = await PartnerRepository.findByUserId(userId);
    if (!partner) {
      throw new Conflict("Partner Record Could Not Be Found!");
    }

    const locationData = {
      type: "Point",
      coordinates: [parseFloat(longitude), parseFloat(latitude)],
    };

    await PartnerRepository.updateByUserId(userId, {
      location: locationData,
      lastLocationUpdate: new Date(),
      lastAppHeartbeatAt: new Date(), // Implicit Heartbeat
    });

    return await this.getPartnerProfile(userId);
  }

  // Upload Photo Through Imgbb Integration
  async uploadAmbulanceImage(userId, fileBuffer, originalName) {
    const partner = await PartnerRepository.findByUserId(userId);
    if (!partner) {
      throw new Conflict("Partner Record Could Not Be Found!");
    }

    const imageUrl = await uploadImageToImgBB(fileBuffer, originalName);

    await PartnerRepository.updateByUserId(userId, { ambulanceImageUrl: imageUrl });

    return await this.getPartnerProfile(userId);
  }

  async getAllAvailablePartners() {
    return PartnerRepository.findAllAvailable();
  }
}

module.exports = new PartnerService();
