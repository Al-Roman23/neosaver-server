// This File Handles Partner Validation Logic
const { BadRequest } = require("../../core/errors/errors");

const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_USER_FIELDS = ["name", "email", "phone", "address"];
const ALLOWED_PARTNER_FIELDS = [
  "ambulanceType",
  "vehicleNumber",
  "driverLicenseNumber",
  "roadTaxToken",
  "nationalId",
  "referenceId",
  "coverageArea",
  "contactNumber",
  "hospitalOrCompanyName",
];
const PROTECTED_FIELDS = ["role", "_id", "userId", "createdAt", "updatedAt"];

function validatePartnerProfileUpdate(data) {
  const updateKeys = Object.keys(data);
  
  if (updateKeys.length === 0) {
    throw new BadRequest("At Least One Field Must Be Provided To Update!");
  }

  // Reject Protected Fields
  for (const field of PROTECTED_FIELDS) {
    if (updateKeys.includes(field)) {
      throw new BadRequest(`The '${field}' Field Cannot Be Modified!`);
    }
  }

  // Reject Unknown Fields
  for (const key of updateKeys) {
    if (!ALLOWED_USER_FIELDS.includes(key) && !ALLOWED_PARTNER_FIELDS.includes(key)) {
      throw new BadRequest(`The Field '${key}' Is Not Allowed For Update!`);
    }
  }

  // Validate Formats If Present
  if (data.email && !EMAIL_REGEX.test(data.email)) {
    throw new BadRequest("Invalid Email Format!");
  }
  
  if (data.phone && !BD_PHONE_REGEX.test(data.phone)) {
    throw new BadRequest("Phone Must Be A Valid Bangladeshi Number (+8801XXXXXXXXX)!");
  }
}

function validateStatusUpdate(data) {
  const { currentStatus } = data;
  if (!currentStatus) {
    throw new BadRequest("Current Status Is Required!");
  }
  
  if (currentStatus !== "online" && currentStatus !== "offline") {
    throw new BadRequest("Status Must Be 'online' Or 'offline'!");
  }
}

function validatePartnerDetails(data) {
  const {
    ambulanceType,
    licenseNumber,
    roadTaxToken,
    nationalId,
    vehicleNumber,
    coverageArea,
    contactNumber,
    email,
    companyName,
  } = data;

  if (
    !ambulanceType ||
    !licenseNumber ||
    !roadTaxToken ||
    !nationalId ||
    !vehicleNumber ||
    !coverageArea ||
    !contactNumber ||
    !email ||
    !companyName
  ) {
    throw new BadRequest("All Required Partner Details Must Be Provided!");
  }

  if (email && !EMAIL_REGEX.test(email.toLowerCase().trim())) {
    throw new BadRequest("Invalid Email Format!");
  }
}

module.exports = {
  validatePartnerProfileUpdate,
  validateStatusUpdate,
  validatePartnerDetails,
  ALLOWED_USER_FIELDS,
  ALLOWED_PARTNER_FIELDS,
};
