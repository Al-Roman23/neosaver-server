// This File Handles Profile Business Logic
const UserRepository = require("./user.repository");
const { uploadImageToImgBB } = require("../../utils/imgbb");
const { NotFound, Conflict } = require("../../core/errors/errors");

class ProfileService {
  // Logic To Fetch User Profile
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

  // Logic To Handle Partial Field Updates
  async updateProfile(userId, updateData) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new NotFound("User Not Found!");

    // If Email Or Phone Is Changing, We Need To Ensure Uniqueness
    if (updateData.email && updateData.email !== user.email) {
      const emailExists = await UserRepository.findByEmail(updateData.email);
      if (emailExists) throw new Conflict("Email Address Is Already In Use By Another Account!");
    }

    if (updateData.phone && updateData.phone !== user.phone) {
      const phoneExists = await UserRepository.findByPhone(updateData.phone);
      if (phoneExists) throw new Conflict("Phone Number Is Already In Use By Another Account!");
    }

    // Process Partial Update To Db
    await UserRepository.updateById(userId, updateData);

    // Return Complete Updated User Profile Using Our Existing Fetch Function
    return await this.getProfile(userId);
  }

  // Logic To Handle Imgbb Upload And Db Update Together
  async uploadProfileImage(userId, fileBuffer, originalName) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new NotFound("User Not Found!");

    // Push To Imgbb Through Utility
    const imageUrl = await uploadImageToImgBB(fileBuffer, originalName);

    // Persist To Database
    await UserRepository.updateById(userId, { profileImageUrl: imageUrl });

    // Return The Updated Document Profile
    return await this.getProfile(userId);
  }
}

module.exports = new ProfileService();
