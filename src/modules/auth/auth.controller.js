// This File Handles The Authentication Controller
const AuthService = require("./auth.service");
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} = require("./auth.validator");
const { BadRequest } = require("../../core/errors/errors");

class AuthController {
  // Register A New User
  async register(req, res, next) {
    try {
      validateRegister(req.body);

      const { accessToken, refreshToken, user } = await AuthService.registerUser(req.body);

      res.status(201).json({
        success: true,
        message: "User Registered Successfully!",
        data: { accessToken, refreshToken, user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Login With Email Or Phone
  async login(req, res, next) {
    try {
      // Normalize -> Accept Identifier, Email, Or Phone From Client
      const identifier = req.body.identifier || req.body.email || req.body.phone;
      const { password } = req.body;

      validateLogin({ identifier, password });

      const { accessToken, refreshToken, user } = await AuthService.loginUser(identifier, password);

      res.json({
        success: true,
        message: "Login Successful!",
        data: { accessToken, refreshToken, user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Request Password Reset Via Email
  async forgotPassword(req, res, next) {
    try {
      validateForgotPassword(req.body);

      await AuthService.forgotPassword(req.body.email);

      // Always Return Success To Prevent Email Enumeration
      res.json({
        success: true,
        message: "If This Email Is Registered, A Reset Link Has Been Sent.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Reset Password Using Token
  async resetPassword(req, res, next) {
    try {
      validateResetPassword(req.body);

      const { token, password } = req.body;
      await AuthService.resetPassword(token, password);

      res.json({
        success: true,
        message: "Password Reset Successfully. Please Log In.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Refresh Access Token -> Obtains New Access Token Using Valid Refresh Token
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        throw new BadRequest("Refresh Token Is Required!");
      }

      const result = await AuthService.refreshAccessToken(refreshToken);

      res.json({
        success: true,
        message: "Token Refreshed Successfully!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Logout User -> Invalidates Refresh Token
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await AuthService.logoutUser(refreshToken);
      }

      res.json({
        success: true,
        message: "Logged Out Successfully!",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
