// This File Handles The Negotiation Controller Logic
const NegotiationService = require("./negotiation.service");

class NegotiationController {
  // REST Endpoint To Initiate A Negotiation (Handshake)
  async initiate(req, res, next) {
    try {
      const userId = req.user.id;
      const { orderId, driverId, version } = req.body;

      if (!orderId || !driverId) {
        throw new (require("../../core/errors/errors")).BadRequest("Missing Required Negotiation Fields!");
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
}

module.exports = new NegotiationController();
