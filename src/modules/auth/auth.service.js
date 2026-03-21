// This File Handles The Authentication Service
const UserRepository = require("../user/user.repository");
const AuthRepository = require("./auth.repository");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { generateToken, verifyToken } = require("../../utils/jwt");
const { sendPasswordResetEmail } = require("../../utils/email");
const { Conflict, Unauthorized, Forbidden, BadRequest } = require("../../core/errors/errors");
const { detectIdentifierType } = require("./auth.validator");
const logger = require("../../utils/logger");

const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";

class AuthService {
  async registerUser(data) {
    // Normalize Email To Lowercase Before Any Operation
    const email = data.email.toLowerCase().trim();
    const {
      name,
      firstName,
      lastName,
      phone,
      password,
      address,
      postCode,
      role,
      acceptedTerms
    } = data;

    // Check Email Uniqueness
    const emailExists = await UserRepository.findByEmail(email);
    if (emailExists) throw new Conflict("Email Is Already Registered!");

    // Check Phone Uniqueness
    const phoneExists = await UserRepository.findByPhone(phone);
    if (phoneExists) throw new Conflict("Phone Number Is Already Registered!");

    // Hash The User Password
    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = {
      name: name.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email,
      phone,
      address,
      postCode,
      password: hashedPassword,
      role,
      acceptedTerms: true,
      status: "active",
      // Optional Fields Initialized To Null
      profileImageUrl: null,
      latitude: null,
      longitude: null,
      lastLogin: null,
      lastTokenUpdate: null,
      passwordChangedAt: null,
    };

    const result = await UserRepository.createUser(newUser);
    const userId = result.insertedId;

    // Generate Access And Refresh Tokens
    const { accessToken, refreshToken } = await this._generateAuthTokens({
      id: userId,
      email,
      role: role,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        _id: userId,
        name: newUser.name,
        email,
        phone,
        role: newUser.role
      },
    };
  }

  async loginUser(identifier, password) {
    const identifierType = detectIdentifierType(identifier);

    if (!identifierType) {
      throw new BadRequest("Identifier Must Be A Valid Email Or Bangladeshi Phone Number!");
    }

    // Normalize Email Identifier To Lowercase Before Lookup
    const normalizedIdentifier =
      identifierType === "email" ? identifier.toLowerCase().trim() : identifier;

    // Find User By Email Or Phone Based On Input Type
    const user =
      identifierType === "email"
        ? await UserRepository.findByEmail(normalizedIdentifier)
        : await UserRepository.findByPhone(normalizedIdentifier);

    if (!user) throw new Unauthorized("Invalid Credentials!");

    // Reject Login For Suspended Accounts
    if (user.status !== "active") {
      throw new Forbidden("Account Is Suspended! Please Contact Support.");
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Unauthorized("Invalid Credentials!");

    // Update Last Login Timestamp
    await UserRepository.updateById(user._id, { lastLogin: new Date() });

    // Generate Access And Refresh Tokens
    const { accessToken, refreshToken } = await this._generateAuthTokens({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  async refreshAccessToken(providedRefreshToken) {
    try {
      // 1. Verify The Refresh Token Signature
      const decoded = verifyToken(providedRefreshToken);

      // 2. Check If Refresh Token Exists In Database
      const tokenDoc = await AuthRepository.findRefreshToken(providedRefreshToken);
      if (!tokenDoc) throw new Unauthorized("Invalid Refresh Token!");

      // 3. Find The User To Ensure They Still Exist And Are Active
      const user = await UserRepository.findById(decoded.id);
      if (!user || user.status !== "active") {
        throw new Unauthorized("User Not Found Or Suspended!");
      }

      // 4. Generate A New Access Token -> Maintain Current Refresh Token
      const accessToken = generateToken({
        id: user._id,
        email: user.email,
        role: user.role,
      });

      return { accessToken };
    } catch (err) {
      logger.warn({ errName: err.name }, "Refresh Token Verification Failed!");
      throw new Unauthorized("Session Expired! Please Log In Again.");
    }
  }

  // Logout User -> Delete Refresh Token From Database
  async logoutUser(refreshToken) {
    return AuthRepository.deleteRefreshToken(refreshToken);
  }

  // Internal Helper To Generate And Store Token Pair
  async _generateAuthTokens(payload) {
    const accessToken = generateToken(payload);
    const refreshToken = generateToken(payload, REFRESH_TOKEN_EXPIRES_IN);

    // Store Refresh Token In Database
    await AuthRepository.saveRefreshToken(payload.id, refreshToken);

    return { accessToken, refreshToken };
  }

  async forgotPassword(email) {
    // Normalize Email To Lowercase Before Lookup
    const normalizedEmail = email.toLowerCase().trim();
    const user = await UserRepository.findByEmail(normalizedEmail);

    // Do Not Reveal Whether Email Exists
    if (!user) return;

    // Generate A Secure Random Reset Token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Save Token To Database -> Ttl Index Will Auto-expire After 1 Hour
    await AuthRepository.saveResetToken(normalizedEmail, resetToken);

    // Wrap Email Send In Try/catch To Preserve Anonymity Guarantee
    try {
      await sendPasswordResetEmail(normalizedEmail, resetToken);
    } catch (err) {
      logger.error({ err }, "Password Reset Email Failed To Send Silently!");
    }
  }

  async resetPassword(token, newPassword) {
    // Find The Token Document
    const tokenDoc = await AuthRepository.findResetToken(token);
    if (!tokenDoc) throw new BadRequest("Invalid Or Expired Reset Token!");

    // Hash The New Password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update Password And Set Passwordchangedat To Invalidate Old Tokens
    await UserRepository.updatePasswordByEmail(tokenDoc.email, hashedPassword);
    await AuthRepository.deleteResetToken(token);

    return { success: true };
  }
}

module.exports = new AuthService();
