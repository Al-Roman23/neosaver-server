// This File Handles The Order Controller
const OrderService = require("./order.service");

class OrderController {
  // Create A New Ambulance Order Request
  async createOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const { pickupLng, pickupLat, destinationLng, destinationLat, notes } = req.body;

      const order = await OrderService.createOrder(userId, {
        pickupLng,
        pickupLat,
        destinationLng,
        destinationLat,
        notes,
      });

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
      const orders = await OrderService.getOrderHistory(userId);

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  // Cancel An Active Order
  async cancelOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const { id: orderId } = req.params;

      const result = await OrderService.cancelOrder(orderId, userId);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // Arrived At Pickup (Driver Only)
  async arrived(req, res, next) {
    try {
      const partnerId = req.user.id;
      const { id: orderId } = req.params;
      const order = await OrderService.arrived(orderId, partnerId);

      res.status(200).json({
        success: true,
        message: "Arrived Notification Sent To User",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // Start Trip — Patient In Ambulance (Driver Only)
  async startTrip(req, res, next) {
    try {
      const partnerId = req.user.id;
      const { id: orderId } = req.params;
      const order = await OrderService.startTrip(orderId, partnerId);

      res.status(200).json({
        success: true,
        message: "Trip Started — Heading To Destination",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // Complete Trip — Arrived At Hospital (Driver Only)
  async completeTrip(req, res, next) {
    try {
      const partnerId = req.user.id;
      const { id: orderId } = req.params;
      const order = await OrderService.completeTrip(orderId, partnerId);

      res.status(200).json({
        success: true,
        message: "Trip Completed Successfully!",
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
      const orders = await OrderService.getOrderHistoryByPartner(partnerId);

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
