// This File Handles The Negotiation Controller Logic
const NegotiationService = require("./negotiation.service");
const { BadRequest } = require("../../core/errors/errors");

class NegotiationController {
  // Rest Endpoint To Initiate A Negotiation Handshake
  async initiate(req, res, next) {
    try {
      const userId = req.user.id;
      const { orderId, driverId, version } = req.body;

      if (!orderId || !driverId) {
        throw new BadRequest("Missing Required Negotiation Fields!");
      }

      const session = await NegotiationService.initiate(userId, {
        orderId, driverId, version
      });

      res.status(201).json({
        success: true,
        message: "Negotiation Session Formally Initiated!",
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin Tool: Get Full Bidding History For An Order
  async getHistory(req, res, next) {
    try {
      const { orderId } = req.params;
      const session = await NegotiationService.getHistory(orderId);
      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NegotiationController();
