// This File Handles Profile Validation Logic
const { BadRequest } = require("../../core/errors/errors");

const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateProfileUpdate(data) {
  const { name, email, phone, address, createdAt } = data;

  // Prevent Createdat Updating
  if (createdAt) {
    throw new BadRequest("CreatedAt Field Cannot Be Modified!");
  }

  // Ensure At Least One Field Is Provided For Update
  if (!name && !email && !phone && !address) {
    throw new BadRequest("At Least One Field Must Be Provided To Update!");
  }

  // Validate Email Format If Provided
  if (email && !EMAIL_REGEX.test(email)) {
    throw new BadRequest("Invalid Email Format!");
  }

  // Validate Bangladeshi Phone Format If Provided
  if (phone && !BD_PHONE_REGEX.test(phone)) {
    throw new BadRequest("Phone Must Be A Valid Bangladeshi Number (+8801XXXXXXXXX)!");
  }
}

module.exports = {
  validateProfileUpdate,
};
