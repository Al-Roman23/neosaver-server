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
    const nonceRegistry = new Set(); // Replay Protection Registry (In-memory Proxy)

    this.io.on("connection", (socket) => {
      const userId = socket.userId;
      
      // Map User Id To Socket Id
      this.users.set(userId.toString(), socket.id);
      
      // Force Drivers To Join A Dedicated Room For Dispatch Targeting
      socket.join("driver_" + userId);

      logger.info({ userId, socketId: socket.id }, "User Online — Listening For Core Engine Events.");

      // Security Guard: Replay Attack Defense (Timestamp + Nonce)
      const validateReplay = (timestamp, nonce) => {
        const skew = Math.abs(Date.now() - timestamp);
        if (skew > 15000) return false; // Max 15s Drift
        if (nonceRegistry.has(nonce)) return false; 
        nonceRegistry.add(nonce);
        setTimeout(() => nonceRegistry.delete(nonce), 600000); // 10-Min Ttl
        return true;
      };

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

      // Listener: User Initiates Manual Negotiation With A Specific Driver
      socket.on("initiate_negotiation", async ({ orderId, driverId, amount, version, timestamp, nonce }, ack) => {
        try {
          if (!validateReplay(timestamp, nonce)) return ack({ success: false, message: "Security Violation: Replay Detected!" });
          const NegotiationService = require("../modules/negotiation/negotiation.service");
          
          const session = await NegotiationService.initiate(userId.toString(), { 
            orderId, driverId, initialAmount: amount, version 
          });

          // Join Both Participant Rooms For Real-time Sync
          socket.join("order_" + orderId);
          const driverSocketId = this.users.get(driverId.toString());
          if (driverSocketId) {
             const driverSocket = this.io.sockets.sockets.get(driverSocketId);
             if (driverSocket) driverSocket.join("order_" + orderId);
          }

          // Emit Negotiation Request To Driver
          this.io.to("driver_" + driverId).emit("new_negotiation_request", {
            orderId, sessionId: session._id, userId, initialAmount: amount
          });

          ack({ success: true, sessionId: session._id });
          logger.info({ orderId, userId, driverId }, "Negotiation Formally Initiated!");
        } catch (error) {
          logger.error({ error, userId }, "Bidding Initiation Blocked!");
          ack({ success: false, message: error.message });
        }
      });

      // Listener: Bidding Interaction (User/Driver Counter-offer Or Respond)
      socket.on("negotiation_respond", async ({ sessionId, orderId, action, amount, sequence, timestamp, nonce }, ack) => {
        try {
          if (!validateReplay(timestamp, nonce)) return;
          const NegotiationService = require("../modules/negotiation/negotiation.service");
          const NegotiationRepository = require("../modules/negotiation/negotiation.repository");

          const session = await NegotiationRepository.findById(sessionId);
          if (!session || session.status !== "active") return ack({ success: false, message: "Session Inactive!" });

          // Message Ordering Guarantee (Sequence Check)
          if (sequence <= (session.lastSequence || 0)) return ack({ success: false, message: "Out-of-Order Packet Trapped!" });

          if (action === "accept") {
             // 1. Transactional Accept Post-Negotiation
             const updatedOrder = await OrderRepository.updateStatusWithGuard(orderId, session.driverId, "negotiating", "accepted", {
               partnerId: new (require("mongodb")).ObjectId(session.driverId),
               acceptedAt: new Date(),
               finalFare: session.messages[session.messages.length - 1].amount
             });
             
             if (!updatedOrder) return ack({ success: false, message: "Double-booking Collision Detected!" });

             // 2. Lock Driver For The Trip Document
             await PartnerRepository.lockDriver(session.driverId, orderId);
             
             // 3. Mark Negotiation As Audit-Closed
             await NegotiationRepository.updateStatus(sessionId, "accepted", { endedReason: "agreement_reached" });

             this.io.to("order_" + orderId).emit("negotiation_finalized", { status: "accepted", orderId });
             return ack({ success: true });
          }

          if (action === "reject") {
             await NegotiationService.failNegotiation(sessionId, "rejected_by_party");
             this.io.to("order_" + orderId).emit("negotiation_finalized", { status: "rejected", orderId });
             return ack({ success: true });
          }
          
          // Add Message (Target Document Has status: 'active' Guard)
          const updatedSession = await NegotiationRepository.addMessage(sessionId, {
            sender: socket.userId.toString() === session.userId.toString() ? "user" : "driver",
            amount
          });

          if (!updatedSession) return ack({ success: false, message: "Bid Round Limit Exceeded!" });

          // Synchronize State To All Parties In The Room
          this.io.to("order_" + orderId).emit("negotiation_update", {
             sessionId, amount, round: updatedSession.currentRound, sequence
          });
          
          ack({ success: true });
        } catch (error) {
          logger.error({ error, userId }, "Bidding Interaction Cycle Failed!");
          ack({ success: false });
        }
      });

      socket.on("disconnect", () => {
        this.users.delete(userId.toString());
        locationRateLimits.delete(userId.toString());
        logger.info({ userId, socketId: socket.id }, "User Disconnected (Stateless Pulse Intact).");
      });
    });

    // WebSocket Service Initialized Successfully!
  }

  // Refactored Reliable Delivery With Triple-retry ACK Logic For Mission-Critical Status
  sendToUser(userId, event, data, retryCount = 0) {
    const socketId = this.users.get(userId.toString());
    if (socketId && this.io) {
      // Use Socket.io Built-in Timeout To Verify Remote Handshake
      this.io.to(socketId).timeout(5000).emit(event, data, (err, responses) => {
        if (err) {
          if (retryCount < 2) {
             logger.warn({ userId, event, retryCount }, "Real-time ACK Missing — Retrying...");
             this.sendToUser(userId, event, data, retryCount + 1);
          } else {
             logger.error({ userId, event }, "TCP/WS Delivery Exhausted — Queueing Persistence.");
             OfflineNotificationService.queueNotification(userId, event, data);
          }
        }
      });
      return true;
    }
    
    OfflineNotificationService.queueNotification(userId, event, data);
    return false;
  }
}

module.exports = new SocketService();
