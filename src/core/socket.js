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
      connectTimeout: 5000, // Defends Against Slowloris/Spam Hanging Connections
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

    // Security Guard: Distributed Replay Attack Defense (Timestamp + Nonce)
    const validateReplay = async (timestamp, nonce) => {
      try {
        const skew = Math.abs(Date.now() - timestamp);
        if (skew > 30000) return false; // Max 30s Drift

        const { getCollection } = require("../config/db");
        const collection = await getCollection("nonces");
        
        // Atomic Insert-If-Not-Exists (Unique Constraint Handle)
        await collection.insertOne({ nonce, createdAt: new Date() });
        return true;
      } catch (err) {
        // Duplicate Nonce Error (Code 11000) Means Replay Detected
        return false;
      }
    };

    this.io.on("connection", (socket) => {
      const userId = socket.userId;
      
      // Map User Id To Socket Id
      this.users.set(userId.toString(), socket.id);
      
      // Force Drivers To Join A Dedicated Room For Dispatch Targeting
      socket.join("driver_" + userId);

      logger.info({ userId, socketId: socket.id }, "User Online — Listening For Core Engine Events.");

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
            
            // Broadcast Live Push To The Dedicated Order Room (With Distance Proximity Metadata)
            const order = await OrderRepository.findById(orderId);
            const pickup = order.pickupLocation.coordinates;
            
            // Simple Spherical Earth Distance (Approximate meters)
            const R = 6371e3;
            const φ1 = lat * Math.PI/180;
            const φ2 = pickup[1] * Math.PI/180;
            const Δφ = (pickup[1]-lat) * Math.PI/180;
            const Δλ = (pickup[0]-lng) * Math.PI/180;
            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distanceMeters = Math.round(R * c);

            this.io.to("order_" + orderId).emit("trip_location_update", {
              lat,
              lng,
              distanceMeters,
              estimateArrivalMins: Math.ceil((distanceMeters / 1000) * 2), // Conservative 2min/km Estimate
              timestamp: now
            });
          }
        } catch (error) {
          logger.error({ error, userId }, "Failed To Process Driver Location Update!");
        }
      });

      // Listener: User Initiates Manual Negotiation With A Specific Driver
      socket.on("initiate_negotiation", async ({ orderId, driverId, version, timestamp, nonce }, ack) => {
        try {
          if (!(await validateReplay(timestamp, nonce))) return ack({ success: false, message: "Security Violation: Replay Detected!" });
          const NegotiationService = require("../modules/negotiation/negotiation.service");
          
          const session = await NegotiationService.initiate(userId.toString(), { 
            orderId, driverId, version 
          });

          // Fetch Combined Order + Limited User Profile For Driver UI
          const OrderService = require("../modules/order/order.service");
          const combinedOrder = await OrderService.getOrderDetails(orderId, driverId, "driver");

          // Join Both Participant Rooms For Real-time Sync
          socket.join("order_" + orderId);
          const driverSocketId = this.users.get(driverId.toString());
          if (driverSocketId) {
             const driverSocket = this.io.sockets.sockets.get(driverSocketId);
             if (driverSocket) driverSocket.join("order_" + orderId);
          }

          // Emit Negotiation Request To Driver (Include Combined Payload For Latency Reduction)
          this.io.to("driver_" + driverId).emit("new_negotiation_request", {
            orderId, 
            sessionId: session._id, 
            userId,
            order: combinedOrder
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
          if (!(await validateReplay(timestamp, nonce))) return;
          const NegotiationService = require("../modules/negotiation/negotiation.service");
          const NegotiationRepository = require("../modules/negotiation/negotiation.repository");

          const session = await NegotiationRepository.findById(sessionId);
          if (!session || session.status !== "active") return ack({ success: false, message: "Session Inactive!" });

          // Message Ordering Guarantee (Sequence Check)
          if (sequence <= (session.lastSequence || 0)) return ack({ success: false, message: "Out-of-Order Packet Trapped!" });

          if (action === "accept") {
             // 1. Service-Layer Atomic Completion (Business Rules + Analytics)
             await NegotiationService.completeNegotiation(sessionId, orderId);
             
             // 2. Synchronize Unified State To Room Participants
             this.io.to("order_" + orderId).emit("negotiation_finalized", { 
               status: "accepted", 
               orderId 
             });

             return ack({ success: true });
          }

          if (action === "reject") {
             await NegotiationService.failNegotiation(sessionId, "rejected_by_party");
             this.io.to("order_" + orderId).emit("negotiation_finalized", { status: "rejected", orderId });
             return ack({ success: true });
          }
          
          // Add Message (Target Document Has Status: 'Active' And 'LastSequence' Guard)
          const updatedSession = await NegotiationRepository.addMessage(sessionId, {
            sender: socket.userId.toString() === session.userId.toString() ? "user" : "driver",
            amount,
            sequence
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
