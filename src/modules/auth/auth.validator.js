// This File Handles Auth Validation Logic
const { BadRequest } = require("../../core/errors/errors");

const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(data) {
  const { name, firstName, lastName, email, phone, password, address, postCode, role, acceptedTerms } = data;

  if (!name || !firstName || !lastName || !email || !phone || !password || !address || !postCode || !role) {
    throw new BadRequest("All Required Fields Must Be Provided For Registration!");
  }

  if (!acceptedTerms) {
    throw new BadRequest("You Must Accept The Terms And Conditions!");
  }

  if (!EMAIL_REGEX.test(email.toLowerCase().trim())) {
    throw new BadRequest("Invalid Email Format!");
  }

  if (!BD_PHONE_REGEX.test(phone)) {
    throw new BadRequest("Phone Must Be A Valid Bangladeshi Number (+8801XXXXXXXXX)!");
  }

  if (password.length < 6) {
    throw new BadRequest("Password Must Be At Least 6 Characters Long!");
  }

  if (role !== "user" && role !== "driver" && role !== "admin") {
    throw new BadRequest("Invalid User Role Assigned!");
  }
}

function validateLogin(data) {
  const { identifier, password } = data;
  if (!identifier || !password) {
    throw new BadRequest("Email/Phone And Password Are Required For Login!");
  }
}

function validateForgotPassword(data) {
  const { email } = data;
  if (!email || !EMAIL_REGEX.test(email.toLowerCase().trim())) {
    throw new BadRequest("A Valid Email Address Is Required For Password Reset!");
  }
}

function validateResetPassword(data) {
  const { token, password } = data;
  if (!token || !password || password.length < 6) {
    throw new BadRequest("A Valid Token And Password (Min 6 Chars) Are Required!");
  }
}

function detectIdentifierType(identifier) {
  if (EMAIL_REGEX.test(identifier.toLowerCase().trim())) return "email";
  if (BD_PHONE_REGEX.test(identifier)) return "phone";
  return null;
}

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  detectIdentifierType,
};
