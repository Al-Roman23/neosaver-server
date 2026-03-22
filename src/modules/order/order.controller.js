// This File Handles The Order Controller
const OrderService = require("./order.service");

class OrderController {
  // Create A New Ambulance Order Request
  async createOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const { 
        pickupLng, pickupLat, 
        destinationLng, destinationLat, 
        pickupLocation, destinationLocation,
        notes, fareEstimate, partnerId, ambulanceType 
      } = req.body;

      // Extract Coordinates From Either Top-Level Or Nested Payload
      const orderData = {
        pickupLng: pickupLng || (pickupLocation ? pickupLocation.lng : null),
        pickupLat: pickupLat || (pickupLocation ? pickupLocation.lat : null),
        destinationLng: destinationLng || (destinationLocation ? destinationLocation.lng : null),
        destinationLat: destinationLat || (destinationLocation ? destinationLocation.lat : null),
        notes,
        fareEstimate,
        partnerId,
        ambulanceType
      };

      const order = await OrderService.createOrder(userId, orderData);

      res.status(201).json({
        success: true,
        message: "Order Created! Searching For Nearby Ambulances...",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Current Active Order For The User
  async getActiveOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const order = await OrderService.getActiveOrder(userId);

      res.status(200).json({
        success: true,
        data: order || null,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Full Order History For The User
  async getOrderHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const { status } = req.query; // Optional Status Filter
      const orders = await OrderService.getOrderHistory(userId, status);

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  // Fetch Nearby Drivers For Discovery Layer (Includes Surge Data)
  async getNearbyDrivers(req, res, next) {
    try {
      const { pickupLng, pickupLat } = req.query;
      if (!pickupLng || !pickupLat) throw new require("../../core/errors/errors").BadRequest("Coordinates Required!");

      const data = await OrderService.fetchNearbyForDiscovery(pickupLng, pickupLat, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Cancel An Order (Supports User, Driver, And Penalty Logic)
  async cancelOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const { id: orderId } = req.params;
      const role = req.user.role; // Extract Role From Token

      const result = await OrderService.cancelOrder(orderId, userId, role);

      res.status(200).json({
        success: true,
        message: result.message,
        penaltyFlag: result.penaltyFlag
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Comprehensive Details For A Specific Order Id
  async getOrderDetails(req, res, next) {
    try {
      const { id: orderId } = req.params;
      const userId = req.user.id;
      const role = req.user.role;

      const order = await OrderService.getOrderDetails(orderId, userId, role);

      res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // Start Trip — Requires OTP Verification From User Device
  async startTrip(req, res, next) {
    try {
      const partnerId = req.user.id;
      const { id: orderId } = req.params;
      const { otp } = req.body;

      if (!otp) throw new require("../../core/errors/errors").BadRequest("OTP Verification Code Required!");

      const order = await OrderService.startTripWithOTP(orderId, partnerId, otp);

      res.status(200).json({
        success: true,
        message: "OTP Verified! Trip Started Successfully.",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // Driver Arrives At Destination (Status Toggle Post-Negotiation)
  async markArrived(req, res, next) {
    try {
      const partnerId = req.user.id;
      const { id: orderId } = req.params;
      const order = await OrderService.markArrived(orderId, partnerId);

      res.status(200).json({
        success: true,
        message: "Arrival Formally Logged. Waiting For User OTP.",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // Final Completion — Final Destination Reached (Driver Only)
  async completeTrip(req, res, next) {
    try {
      const partnerId = req.user.id;
      const { id: orderId } = req.params;
      const order = await OrderService.finishTrip(orderId, partnerId);

      res.status(200).json({
        success: true,
        message: "Trip Completed! Checkout Process Finalized.",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Current Trip For Driver
  async getActiveOrderByPartner(req, res, next) {
    try {
      const partnerId = req.user.id;
      const order = await OrderService.getActiveOrderByPartner(partnerId);

      res.status(200).json({
        success: true,
        data: order || null,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Past Trip History For Driver
  async getOrderHistoryByPartner(req, res, next) {
    try {
      const partnerId = req.user.id;
      const { status } = req.query; // Optional Status Filter
      const orders = await OrderService.getOrderHistoryByPartner(partnerId, status);

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrderController();
