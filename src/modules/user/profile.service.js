// This File Handles Profile Business Logic
const UserRepository = require("./user.repository");
const { uploadImageToImgBB } = require("../../utils/imgbb");
const { NotFound, Conflict } = require("../../core/errors/errors");

class ProfileService {
  // This Fetches The User Profile From The Database
  async getProfile(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new NotFound("User Not Found!");

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      createdAt: user.createdAt,
      profileImageUrl: user.profileImageUrl,
    };
  }

  // This Handles Partial Updates Of User Profile Fields
  async updateProfile(userId, updateData) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new NotFound("User Not Found!");

    // This Ensures Email And Phone Uniqueness If They Are Being Updated
    if (updateData.email && updateData.email !== user.email) {
      const emailExists = await UserRepository.findByEmail(updateData.email);
      if (emailExists) {
        throw new Conflict("Email Address Is Already In Use By Another Account!");
      }
    }

    if (updateData.phone && updateData.phone !== user.phone) {
      const phoneExists = await UserRepository.findByPhone(updateData.phone);
      if (phoneExists) {
        throw new Conflict("Phone Number Is Already In Use By Another Account!");
      }
    }

    // This Updates The User Profile Fields In The Database
    await UserRepository.updateById(userId, updateData);

    // This Returns The Fully Updated User Profile
    return await this.getProfile(userId);
  }

  // This Handles Profile Image Upload And Database Update
  async uploadProfileImage(userId, fileBuffer, originalName) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new NotFound("User Not Found!");

    // This Uploads The Image To Imgbb Using Utility Function
    const imageUrl = await uploadImageToImgBB(fileBuffer, originalName);

    // This Saves The Image Url To The Database
    await UserRepository.updateById(userId, { profileImageUrl: imageUrl });

    // This Returns The Fully Updated User Profile
    return await this.getProfile(userId);
  }
}

module.exports = new ProfileService();
