// This File Handles The Feedback Validation
const { BadRequest } = require("../../core/errors/errors");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFeedback(data) {
  const { name, email, rating, feedback } = data;

  // Check All Required Fields
  if (!name) throw new BadRequest("Name Is Required!");
  if (!email) throw new BadRequest("Email Is Required!");
  if (rating === undefined || rating === null) throw new BadRequest("Rating Is Required!");
  if (!feedback) throw new BadRequest("Feedback Text Is Required!");

  // Validate Email Format
  if (!EMAIL_REGEX.test(email)) {
    throw new BadRequest("Invalid Email Format!");
  }

  // Validate Rating Range
  const ratingNum = Number(rating);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new BadRequest("Rating Must Be Between 1 And 5 Stars!");
  }

  // Validate Feedback Length
  if (feedback.trim().length < 10) {
    throw new BadRequest("Feedback Must Be At Least 10 Characters Long!");
  }
}

module.exports = {
  validateFeedback,
};
