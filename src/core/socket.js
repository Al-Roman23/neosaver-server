// This File Handles The Websocket Logic Using Socket.io
"use strict";

const { Server } = require("socket.io");
const { verifyToken } = require("../utils/jwt");
const logger = require("../utils/logger");
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
      } catch {
        // Duplicate Nonce Error (Code 11000) Means Replay Detected
        return false;
      }
    };

    this.io.on("connection", (socket) => {
      const userId = socket.userId;

      // Map User Id To Socket Id
      this.users.set(userId.toString(), socket.id);

      // Join A Dedicated User Room For Multi-Device Synchronized Delivery
      socket.join("user_" + userId);

      logger.info({ userId, socketId: socket.id }, "User Online — Listening For Core Engine Events.");

      // Update Last Socket Connection For Partners Natively (Silently Drops For Non-partners)
      PartnerRepository.updateByUserId(userId, { lastSocketConnectedAt: new Date() }).catch(() => { });

      // Sync Missed Events On Connection
      this.deliverPending(userId, socket);

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
          await PartnerRepository.updateHeartbeat(userId).catch(() => { }); // Refresh Activity Heartbeat Precisely On Gps Update

          // Live Broadcast To Order Room If Driver Is On A Trip
          if (partner.currentOrderId) {
            const orderId = partner.currentOrderId.toString();

            // Sync Location To Order Document (Reopen-App Safety)
            await OrderRepository.updateDriverLocation(orderId, lng, lat);

            // Broadcast Live Push To The Dedicated Order Room (With Distance Proximity Metadata)
            const order = await OrderRepository.findById(orderId);
            const pickup = order.pickupLocation.coordinates;

            // Simple Spherical Earth Distance (Approximate Meters)
            const R = 6371e3;
            const φ1 = lat * Math.PI / 180;
            const φ2 = pickup[1] * Math.PI / 180;
            const Δφ = (pickup[1] - lat) * Math.PI / 180;
            const Δλ = (pickup[0] - lng) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

          // Driver Session Joining And Notification Delivery Are Handled
          // Atomically Within The Negotiation Service And Notification Service Layers
          socket.join("order_" + orderId);
          const driverSocketId = this.users.get(driverId.toString());
          if (driverSocketId) {
            const driverSocket = this.io.sockets.sockets.get(driverSocketId);
            if (driverSocket) driverSocket.join("order_" + orderId);
          }
          ack({ success: true, sessionId: session._id });
          logger.info({ orderId, userId, driverId }, "Negotiation Formally Initiated!");
        } catch (error) {
          logger.error({ error, userId }, "Bidding Initiation Blocked!");
          ack({ success: false, message: error.message });
        }
      });

      // Listener: Bidding Interaction (User Or Driver Counter-Offer Or Respond)
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
            // Service-Layer Atomic Completion (Business Rules + Analytics + Delivery Engine)
            await NegotiationService.completeNegotiation(sessionId, orderId);
            return ack({ success: true });
          }

          if (action === "reject") {
            // Service-Layer Atomic Rejection (Business Rules + Analytics + Delivery Engine)
            await NegotiationService.failNegotiation(sessionId, "rejected_by_party");
            return ack({ success: true });
          }

          // Add Message (Target Document Has Status Active And Last Sequence Guard)
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

      // Application State Transition Listener (Foreground / Background Handshake)
      socket.on("app_state_change", async ({ state }) => {
        try {
          const isBackground = state === "background";
          await PartnerRepository.updateByUserId(userId, {
            isAppInBackground: isBackground,
            lastAppHeartbeatAt: new Date()
          });
          logger.info({ userId, state }, "User App State Transitioned!");
        } catch (err) {
          logger.warn({ err, userId }, "Failed To Persist App State Change!");
        }
      });

      // Listener For Client-Side Notification Acknowledgments (Ack Master Flow)
      socket.on("notification_ack", async ({ notificationId }) => {
        try {
          if (!notificationId) return;
          const NotificationRepository = require("../modules/notification/notification.repository");
          await NotificationRepository.markAsDelivered(notificationId);
          logger.info({ userId, notificationId }, "Notification Formally Acknowledged By Client.");
        } catch (err) {
          logger.warn({ err, userId }, "Failed To Handle Notification ACK!");
        }
      });

      socket.on("disconnect", async () => {
        this.users.delete(userId.toString());
        locationRateLimits.delete(userId.toString());

        // Update Heartbeat On Disconnect To Support Background Persistence
        await PartnerRepository.updateByUserId(userId, {
          lastAppHeartbeatAt: new Date()
        }).catch(() => { });

        logger.info({ userId, socketId: socket.id }, "User Disconnected (Stateless Pulse Intact).");
      });
    });

    // Websocket Service Initialized Successfully!
  }

  // Sync Pending Database Notifications For Recipient On Connection (Reliability Pulse)
  async deliverPending(userId, socket) {
    try {
      const NotificationRepository = require("../modules/notification/notification.repository");
      const pendingEv = await NotificationRepository.findByRecipientId(userId);

      // Extract Untracked Notifications To Flush Buffer
      const unconfirmed = pendingEv.filter(n => n.deliveryStatus !== "SENT");
      if (unconfirmed.length === 0) return;

      // Legacy Mapping For Backward Compatibility With Driver/User Apps
      const legacyMap = {
        NEGOTIATION_REQ: "new_negotiation_request",
        OTP_RECEIVED: "driver_arrived",
        DRIVER_FINISHED: "ready_for_feedback",
        USER_CANCELLED: "order_cancelled",
        DRIVER_REJECT_ORD: "order_cancelled",
      };

      for (const n of unconfirmed) {
        // Map Core Type To Client-Side Event Signature
        const eventName = n.type === "OTP_RECEIVED" ? "otp_received" : "notification_received";
        const payload = {
          notificationId: n._id.toString(),
          type: n.type,
          data: n.content,
          sequence: n.sequence,
          timestamp: n.createdAt
        };

        // Emit Primary Unified Event
        socket.emit(eventName, payload);

        // Emit Parallel Legacy Event If Mapping Found
        if (legacyMap[n.type]) {
          socket.emit(legacyMap[n.type], payload);
        }
      }
    } catch (err) {
      logger.error({ err, userId }, "Failed To Sync Pending Notifications During Pulse!");
    }
  }

  // Refactored Reliable Delivery For Generic Events (Legacy Support)
  sendToUser(userId, event, data) {
    // Deliver To All Active Devices Joined To The User Room
    if (this.io) {
      this.io.to("user_" + userId).emit(event, data);
      return true;
    }
    return false;
  }
}

module.exports = new SocketService();
