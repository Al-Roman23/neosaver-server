// This File Handles The Notification Constants And Priority Mapping
const NOTIFICATION_MAP = {
  // Driver Side Events
  NEGOTIATION_REQ: {
    priority: "HIGH",
    channels: ["push", "in_app", "store"],
    title: "New Negotiation Request",
    body: "A User Is Requesting An Ambulance Near You!",
  },
  USER_CANCELLED: {
    priority: "MEDIUM",
    channels: ["in_app", "store"],
    title: "Order Cancelled",
    body: "The User Has Cancelled Their Request.",
  },
  USER_REJECTED: {
    priority: "MEDIUM",
    channels: ["in_app", "store"],
    title: "Negotiation Rejected",
    body: "The User Has Rejected Your Offer.",
  },
  USER_ACCEPTED: {
    priority: "HIGH",
    channels: ["push", "in_app", "store"],
    title: "Trip Confirmed!",
    body: "User Has Accepted Your Price. Please Start Driving!",
  },
  DRIVER_COMPLETED: {
    priority: "MEDIUM",
    channels: ["in_app", "store"],
    title: "Trip Finished",
    body: "You Have Successfully Completed The Trip.",
  },

  // User Side Events
  DRIVER_REJECT_ORD: {
    priority: "MEDIUM",
    channels: ["push", "in_app", "store"],
    title: "Driver Declined",
    body: "Detailed Pricing Negotiation Was Not Successful.",
  },
  DRIVER_ACCEPTED: {
    priority: "HIGH",
    channels: ["push", "in_app", "store"],
    title: "Driver Matches!",
    body: "A Driver Has Accepted Your Negotiation.",
  },
  OTP_RECEIVED: {
    priority: "HIGH",
    channels: ["in_app", "store"],
    title: "Driver Arrived!",
    body: "Give The Driver Your Secure OTP To Start The Trip.",
  },
  DRIVER_FINISHED: {
    priority: "HIGH",
    channels: ["push", "in_app", "store"],
    title: "You Have Arrived!",
    body: "Trip Successfully Completed. Thank You For Using NeoSaver.",
  },
};

module.exports = { NOTIFICATION_MAP };
