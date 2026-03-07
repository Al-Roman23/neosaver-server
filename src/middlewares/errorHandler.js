// This File Handles The Centralized Error Handling Middleware
const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  // Log Error Details
  logger.error({ err }, "An Error Occurred!");

  // Handle Mongodb Duplicate Key Error Gracefully
  if (err.code === 11000) {
    const duplicateField = Object.keys(err.keyPattern || {})[0] || "Field";
    const fieldName = duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1);
    return res.status(409).json({
      success: false,
      error: `${fieldName} Is Already In Use!`,
    });
  }

  const status = err.status || 500;
  const message = err.message || "Internal Server Error!";

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
