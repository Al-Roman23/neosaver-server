// This File Handles The Role Verification
const { Forbidden } = require("../core/errors/errors");

function verifyRole(allowedRoles) {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        throw new Forbidden("Access Denied: Role Not Identified!");
      }

      if (!allowedRoles.includes(req.user.role)) {
        throw new Forbidden(`Access Denied: ${req.user.role.toUpperCase()} Role Not Authorized!`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { verifyRole };
