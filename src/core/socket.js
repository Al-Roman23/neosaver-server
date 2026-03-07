// This File Handles The Websocket Logic Using Socket.io
"use strict";

const { Server } = require("socket.io");
const { verifyToken } = require("../utils/jwt");
const logger = require("../utils/logger");
const OfflineNotificationService = require("../modules/notification/offlineNotification.service");
const PartnerRepository = require("../modules/partner/partner.repository");
const OrderRepository = require("../modules/order/order.repository");

class SocketService {
  constructor() {
    this.io = null;
    this.users = new Map(); // Map To Store UserId -> SocketId
  }

  // Initialize Socket.io With Http Server
  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // Authentication Middleware For Websockets
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];
        if (!token) {
          return next(new Error("Authentication Error: Token Required!"));
        }

        const decoded = verifyToken(token);
        socket.userId = decoded.id; // Attach UserId To Socket Object
        next();
      } catch (err) {
        logger.warn({ errName: err.name }, "Socket Authentication Failed!");
        next(new Error("Authentication Error: Invalid Token!"));
      }
    });

    const locationRateLimits = new Map();

    this.io.on("connection", (socket) => {
      const userId = socket.userId;
      
      // Map User Id To Socket Id
      this.users.set(userId.toString(), socket.id);
      
      // Force Drivers To Join A Dedicated Room For Dispatch Targeting
      socket.join("driver_" + userId);

      logger.info({ userId, socketId: socket.id }, "User Connected Via WebSocket!");

      // Update Last Socket Connection For Partners Natively (Silently Drops For Non-partners)
      PartnerRepository.updateByUserId(userId, { lastSocketConnectedAt: new Date() }).catch(() => {});

      // Attempt To Deliver Any Pending Offline Notifications Asynchronously
      OfflineNotificationService.deliverPendingNotifications(userId, socket);

      // Listener For Driver Location Updates With Rate Limiting
      socket.on("driver_location_update", async ({ lat, lng }) => {
        try {
          if (!lat || !lng) return;
          const now = Date.now();
          const lastUpdate = locationRateLimits.get(userId.toString()) || 0;
          
          if (now - lastUpdate < 5000) return; // 5 Seconds Max Refresh Rate
          locationRateLimits.set(userId.toString(), now);

          // Update Partner Gps
          const partner = await PartnerRepository.findByUserId(userId);
          if (!partner) return;

          await PartnerRepository.updateDriverLocation(userId, lng, lat);
          
          // Live Broadcast To Order Room If Driver Is On A Trip
          if (partner.currentOrderId) {
            const orderId = partner.currentOrderId.toString();
            
            // Sync Location To Order Document (Reopen-App Safety)
            await OrderRepository.updateDriverLocation(orderId, lng, lat);
            
            // Broadcast Live Push To The Dedicated Order Room
            this.io.to("order_" + orderId).emit("trip_location_update", {
              lat,
              lng,
              timestamp: now
            });
          }
        } catch (error) {
          logger.error({ error, userId }, "Failed To Process Driver Location Update!");
        }
      });

      // Listener: Driver Accepts An Order
      socket.on("accept_order", async ({ orderId }) => {
        try {
          if (!orderId) return;
          const OrderService = require("../modules/order/order.service");

          // Step 1: Atomic Accept At Db Level (Only One Driver Wins)
          const order = await OrderRepository.findById(orderId);
          if (!order || order.status !== "pending") return;

          const accepted = await OrderRepository.atomicAccept(orderId, userId);
          if (!accepted) return; // Another Driver Was Faster

          // Step 2: Atomic Driver Lock
          const lock = await PartnerRepository.lockDriver(userId, orderId);
          if (lock.modifiedCount === 0) {
            // Driver Already Busy -> Revert Order Back To Pending
            await OrderRepository.updateStatus(orderId, "pending");
            return;
          }

          // Step 3: Signal Dispatch Loop That Acceptance Happened
          OrderService.signalAcceptance(orderId);
          OrderService.cancelExpiryTimer(orderId);

          // Step 4: Join Order Room For Live Tracking
          socket.join("order_" + orderId);
          // Also Join The User To The Order Room
          const userSocketId = this.users.get(accepted.userId.toString());
          if (userSocketId) {
            const userSocket = this.io.sockets.sockets.get(userSocketId);
            if (userSocket) userSocket.join("order_" + orderId);
          }

          // Step 5: Notify The User Their Order Was Accepted
          this.sendToUser(accepted.userId.toString(), "order_accepted", {
            orderId,
            driverInfo: { userId },
          });

          // Step 6: Cancel Out All Other Drivers From The Current Dispatch Batch
          const batchIds = OrderService.getDispatchedBatch(orderId);
          if (batchIds) {
            batchIds.forEach((driverUserId) => {
              if (driverUserId !== userId.toString()) {
                this.io.to("driver_" + driverUserId).emit("order_taken", { orderId });
              }
            });
          }

          logger.info({ orderId, userId }, "Order Accepted By Driver!");
        } catch (error) {
          logger.error({ error, userId }, "Failed To Process Order Acceptance!");
        }
      });

      // Listener: Driver Rejects An Order (Order Stays Pending For Next Batch)
      socket.on("reject_order", ({ orderId }) => {
        logger.info({ orderId, userId }, "Driver Rejected Order — Waiting For Next Batch.");
      });

      socket.on("disconnect", () => {
        this.users.delete(userId.toString());
        locationRateLimits.delete(userId.toString());
        
        // Auto-offline Disconnected Drivers Safely
        PartnerRepository.updateByUserId(userId, { isOnline: false, isAvailable: false, currentStatus: "offline" }).catch(() => {});
        logger.info({ userId, socketId: socket.id }, "User Disconnected From WebSocket!");
      });
    });

    // WebSocket Service Initialized Successfully!
  }

  // Send Message To A Specific User By Their Id Or Queue If Offline
  sendToUser(userId, event, data) {
    const socketId = this.users.get(userId.toString());
    if (socketId && this.io) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    logger.warn({ userId, event }, "User Offline: Queueing Notification!");
    
    // Asynchronously Queue Notification For Later
    OfflineNotificationService.queueNotification(userId, event, data);
    return false;
  }
}

module.exports = new SocketService();
