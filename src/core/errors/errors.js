// This File Handles The Custom Error Classes
class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class Unauthorized extends ApiError {
  constructor(msg = "Unauthorized Access!") {
    super(msg, 401);
  }
}

class NotFound extends ApiError {
  constructor(msg = "Resource Not Found!") {
    super(msg, 404);
  }
}

class Forbidden extends ApiError {
  constructor(msg = "Access Forbidden!") {
    super(msg, 403);
  }
}

class Conflict extends ApiError {
  constructor(msg = "Conflict Detected!") {
    super(msg, 409);
  }
}

class BadRequest extends ApiError {
  constructor(msg = "Bad Request!") {
    super(msg, 400);
  }
}

class InternalError extends ApiError {
  constructor(msg = "Internal Server Error!") {
    super(msg, 500);
  }
}

module.exports = {
  ApiError,
  Unauthorized,
  NotFound,
  Forbidden,
  Conflict,
  BadRequest,
  InternalError,
};
