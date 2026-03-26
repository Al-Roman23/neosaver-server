# NeoSaver — API & Frontend Integration Specification

This is the mission-critical Backend API Engine for NeoSaver, a life-saving ambulance dispatch ecosystem designed for the People's Republic of Bangladesh.

This is the **definitive, complete reference** for integrating the NeoSaver frontend with the backend. Every endpoint, every socket event, and every implementation rule is documented here.

> [!IMPORTANT]
> This platform is **mission-critical ambulance dispatch**. All events and state changes carry real-world safety consequences. Follow this guide with exact precision.

---

## 🌍 Global Configuration

| Key | Value |
| :--- | :--- |
| **Production REST API** | `https://neosaver-server.onrender.com/v1/api` |
| **WebSocket Server** | `https://neosaver-server.onrender.com` |
| **API Version Prefix** | `/v1/api` |
| **Auth Header Format** | `Authorization: Bearer <accessToken>` |
| **Content-Type** | `application/json` (unless file upload — use `multipart/form-data`) |

---

## 🔑 Domain 1 — Authentication

**Base URL**: `{BASE_URL}/auth`
> All auth routes are **public** — no Authorization header needed.

| Action | Method | Endpoint | Body Fields | Response | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Register** | POST | `/register` | `name`, `firstName`, `lastName`, `email`, `phone`, `password`, `address`, `postCode`, `role`, `acceptedTerms` | `{ accessToken, refreshToken, user }` | `role`: `"user"` or `"driver"`. `acceptedTerms` must be `true`. |
| **Login** | POST | `/login` | `identifier` (email or phone), `password` | `{ accessToken, refreshToken, user }` | `identifier` accepts both email and phone. |
| **Refresh Token** | POST | `/refresh-token` | `refreshToken` | `{ accessToken }` | Call when `accessToken` expires (HTTP 401 response). |
| **Forgot Password** | POST | `/forgot-password` | `email` | `{ message }` | Sends a reset link to the user's email. |
| **Reset Password** | POST | `/reset-password` | `token` (from email link), `password` | `{ message }` | Completes the password reset flow. |
| **Logout** | POST | `/logout` | `refreshToken` | `{ message }` | Blacklists the refresh token. Always call this on sign-out. |

---

## 👤 Domain 2 — User Profile

**Base URL**: `{BASE_URL}/user`
> All routes require `Authorization: Bearer <accessToken>`. Role: **user only**.

| Action | Method | Endpoint | Body / Notes |
| :--- | :--- | :--- | :--- |
| **Get Profile** | GET | `/profile` | Returns the full user object. |
| **Update Profile** | PUT | `/profile` | Body: `name`, `firstName`, `lastName`, `email`, `phone`, `address`. Partial updates allowed. |
| **Upload Profile Image** | POST | `/profile/image` | `multipart/form-data`. Field name: `image`. Max size: **5MB**. Accepted formats: `jpg`, `jpeg`, `png`, `webp`, `gif`. |

---

## 🚑 Domain 3 — Partner (Driver)

**Base URL**: `{BASE_URL}/partner`
> All routes require `Authorization: Bearer <accessToken>`. Role: **driver** (unless noted).

| Action | Method | Endpoint | Body Fields | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Save Details** | POST | `/details` | `ambulanceType`, `vehicleNumber`, `licenseNumber`, `roadTaxToken`, `nationalId`, `coverageArea`, `contactNumber`, `email`, `companyName` | **Mandatory first step** after registration for drivers. Enables verification. |
| **Get Profile** | GET | `/profile` | N/A | Returns partner-specific data (vehicle, status, location, etc.). |
| **Update Profile** | PUT | `/profile` | `ambulanceType`, `vehicleNumber`, `coverageArea`, etc. | Partial updates allowed. |
| **Update Online Status** | PATCH | `/status` | `currentStatus`: `"online"` or `"offline"` | Controls driver visibility to users in discovery search. |
| **Update Location (HTTP)** | PATCH | `/profile/location` | `latitude`, `longitude` | HTTP fallback only. Prefer Socket `driver_location_update` for live tracking. |
| **Upload Ambulance Image** | POST | `/profile/image` | `multipart/form-data`. Field: `image`. Max: **5MB**. | Uploads the ambulance photo for user trust. |
| **List Available Drivers** | GET | `/list` | N/A | Any authenticated user. Returns all currently available ambulances. |
| **Verify Partner (Admin)** | PATCH | `/:id/verify` | N/A | **Admin role only.** Manually approves a driver account. |

---

## 📦 Domain 4 — Orders

**Base URL**: `{BASE_URL}/orders`
> All routes require `Authorization: Bearer <accessToken>`.

| Action | Method | Endpoint | Role | Body / Query | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Discover Nearby** | GET | `/nearby` | user | Query: `pickupLat`, `pickupLng` | Returns nearby drivers + surge pricing metadata. Respects driver **5-min grace period** if app is backgrounded. |
| **Create Order** | POST | `/` | user | `pickupLat`, `pickupLng`, `pickupAddress` (optional), `destinationLat`, `destinationLng`, `destinationAddress` (optional), `notes` (optional), `fareEstimate` (optional) | Creates a `pending` order. **Save the `_id` (orderId) and `version` from the response.** |
| **Get Active Order** | GET | `/active` | user | N/A | Returns the current live trip. Includes full driver profile once `accepted`. |
| **Get Order History** | GET | `/history` | user | Query: `status` (optional filter) | Returns past trips. |
| **Get Order Details** | GET | `/:id` | user, driver, admin | N/A | Full order document. Returns flat `pickup` and `destination` objects (lat, lng, address) and `distanceKm`. |
| **Cancel Order** | DELETE | `/:id` | user, driver | N/A | Atomically cancels. If driver cancels mid-trip (`arrived`, `pickup_started`, `to_destination`), a `penaltyFlag: true` is set. |
| **Mark Arrived** | PATCH | `/:id/arrived` | driver | N/A | Transitions order to `arrived`. **Triggers `otp_received` socket event to user.** |
| **Start Trip** | PATCH | `/:id/start` | driver | `otp` (4-digit string) | Driver asks patient for OTP verbally. Backend validates. Transitions to `pickup_started`. |
| **Complete Trip** | PATCH | `/:id/complete` | driver | N/A | Finalizes order. Driver is unlocked. **Triggers `DRIVER_FINISHED` notification to user.** |
| **Get Active (Driver)** | GET | `/partner/active` | driver | N/A | Returns driver's current assigned trip. |
| **Get History (Driver)** | GET | `/partner/history` | driver | Query: `status` (optional) | Returns driver's past trips with user/patient details included. |

### 📋 Order Status Machine
```
pending → negotiating → accepted → arrived → pickup_started → to_destination → completed
                                                      ↓
                                              cancelled_by_user
                                              cancelled_by_driver
                                              cancelled_system (ghost trip auto-cancel)
```

> [!NOTE]
> **Data Structure Note**: The `Order` response now returns addresses in a flat structure: `pickup: { lat, lng, address }` and `destination: { lat, lng, address }`. If the address string is not provided during creation, the backend provides a **Smart Fallback** (e.g., `"Location [23.81, 90.41]"`).
>
> **Distance Reporting**: The system automatically calculates `distanceKm` (trip distance) and `distanceToPickupKm` (for drivers) using the Haversine formula. Frontend developers should use these fields for display.

---

## 🤝 Domain 5 — Negotiations

**Base URL**: `{BASE_URL}/negotiations`
> All routes require `Authorization: Bearer <accessToken>`.

| Action | Method | Endpoint | Role | Body | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Initiate Negotiation** | POST | `/initiate` | user | `orderId`, `driverId`, `version` | Starts bidding session. `version` must match the order's current version. Returns `{ sessionId }`. |
| **Get Audit History** | GET | `/history/:orderId` | admin | N/A | Returns the full bidding transcript (all rounds, amounts, both parties) for an order. |

---

## 🔔 Domain 6 — Notifications (Elite Event Delivery Engine)

**Base URL**: `{BASE_URL}/notifications`
> All routes require `Authorization: Bearer <accessToken>`.

| Action | Method | Endpoint | Body | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Get History** | GET | `/history/:userId` | N/A | Returns the last 50 notification records for the user, newest first. Includes `deliveryStatus`, `readStatus`, `type`, and `sequence`. |
| **Manual Trigger (Dev/Test)** | POST | `/send` | `userId`, `orderId`, `type`, `priority`, `channels`, `data`, `version` | Triggers a notification via the full reliability engine. **For testing only** — production events are triggered automatically by services. |

---

## 📄 Domain 7 — Legal & Content

> All routes are **public** — no auth required.

| Action | Method | Endpoint | Body Fields |
| :--- | :--- | :--- | :--- |
| **Terms & Conditions** | GET | `{BASE_URL}/terms-conditions` | N/A |
| **Privacy Policy** | GET | `{BASE_URL}/privacy-policy` | N/A |
| **About Us** | GET | `{BASE_URL}/about-us` | N/A |
| **Submit Feedback** | POST | `{BASE_URL}/feedback` | `name`, `email`, `rating` (1–5, required), `feedback` (text, optional), `orderId` (optional). Auth header is optional. |

---

## 📡 WebSocket Integration (Socket.io)

### **Step 1: Connection**
```javascript
import { io } from "socket.io-client";

const socket = io("https://neosaver-server.onrender.com", {
  auth: { token: accessToken }, // The JWT Access Token — REQUIRED
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
});

socket.on("connect_error", (err) => {
  // "Authentication Error: Token Required!" Means Token Is Missing Or Expired
  console.error(err.message);
});
```
On connection, the backend **automatically**:
- Joins the socket to room `user_<userId>` — all notifications are delivered here.
- Joins the socket to room `driver_<userId>` — all dispatch requests arrive here.
- **Flushes** any missed (`PENDING` status) notifications from the database directly to this socket.

---

### **Step 2: The Replay Protection Rule**
Every single `emit` from the frontend **MUST** include `timestamp` and `nonce`. Without these, the server **rejects the event silently** — no error, no response.

```javascript
// Helper — Use This Before Every Socket Emit
const generateSecurity = () => ({
  timestamp: Date.now(),
  nonce: Math.random().toString(36).substring(2, 15)
});

socket.emit("initiate_negotiation", {
  orderId: "...",
  driverId: "...",
  version: 5,
  ...generateSecurity() // Spread Timestamp + Nonce Into Every Payload
}, (ack) => {
  if (ack.success) console.log("Session ID:", ack.sessionId);
});
```

> [!WARNING]
> The server checks that `timestamp` is within **30 seconds** of server time. Events older than 30s are silently rejected as replay attacks.

---

### **Step 3: Events To EMIT (Client → Server)**

| Event | Payload | Role | Notes |
| :--- | :--- | :--- | :--- |
| `driver_location_update` | `{ lat, lng }` | Driver | Send every 10–30 seconds. Server rate-limits to max **1 update per 5s**. |
| `app_state_change` | `{ state: "background" \| "foreground" }` | Driver | Send when app is minimized or restored. Keeps driver in discovery pool for **5 minutes**. |
| `initiate_negotiation` | `{ orderId, driverId, version, timestamp, nonce }` | User | Starts a bidding session. ACK returns `{ success, sessionId }`. |
| `negotiation_respond` | `{ sessionId, orderId, action, amount, sequence, timestamp, nonce }` | User/Driver | `action`: `"counter"`, `"accept"`, or `"reject"`. `sequence` must increase by 1 each round. `amount` only required for `"counter"`. |
| `notification_ack` | `{ notificationId }` | Both | **Mandatory.** Send immediately after receiving **any** notification. Stops the exponential backoff retry engine. |

---

### **Step 4: Events To LISTEN ON (Server → Client)**

| Event | Trigger | Payload | Frontend Action |
| :--- | :--- | :--- | :--- |
| `notification_received` | Any lifecycle event | `{ notificationId, type, data, sequence, timestamp }` | Route based on `type`. See matrix below. **ACK immediately.** |
| `otp_received` | Driver calls `PATCH /:id/arrived` | `{ notificationId, type: "OTP_RECEIVED", data: { otp, orderId }, sequence }` | **Show the 4-digit OTP to patient on screen. ACK immediately.** |
| `driver_arrived` | Same as above (legacy bridge) | `{ otp, orderId, message }` | **Legacy fallback.** Listen on this too in case `otp_received` is missed. |
| `trip_location_update` | Driver sends `driver_location_update` during trip | `{ lat, lng, distanceMeters, estimateArrivalMins, timestamp }` | Update the live map pin and ETA label. |
| `negotiation_update` | A bid counter is placed | `{ sessionId, amount, round, sequence }` | Update bidding UI with the new counter-offer amount. |
| `trip_status_update` | Server transitions order state | `{ status }` | Sync UI state (e.g. show "Driver En Route", "Arrived", "In Transit"). |

---

### **Step 5: Notification Type Matrix**

Inspect the `type` field inside `notification_received` to decide what screen to navigate to:

| `type` Value | Meaning | Who Receives It | Recommended UI Action |
| :--- | :--- | :--- | :--- |
| `NEGOTIATION_REQ` | User wants to negotiate | **Driver** | Open the "New Dispatch Request" screen with order details. |
| `USER_ACCEPTED` | User accepted the driver's price | **Driver** | Show "Agreed! Start Driving To Pickup" confirmation. |
| `USER_REJECTED` | User rejected the driver's price offer | **Driver** | Show "Offer Declined" toast, return to standby. |
| `USER_CANCELLED` | User cancelled the entire order | **Driver** | Show "Order Cancelled" toast, return to standby. |
| `DRIVER_ACCEPTED` | Driver accepted the user's price | **User** | Navigate to "Driver Matched" screen, show driver profile + ETA. |
| `DRIVER_REJECT_ORD` | Driver rejected the user's offer | **User** | Show "Driver Declined" and allow re-discovery of a new driver. |
| `DRIVER_FINISHED` | Trip has been completed | **User** | Navigate to feedback / rating screen. |

---

### **Step 6: The Mandatory ACK Flow (Full Code)**

```javascript
// Deduplication Cache — Prevents Double-Showing The Same Notification
const seenNotifications = new Set();

// Listen For All General Notifications
socket.on("notification_received", (payload) => {
  const { notificationId, type, data, sequence } = payload;

  // Guard: Skip If Already Processed (Handles Reconnect Flush Duplicates)
  if (seenNotifications.has(notificationId)) return;
  seenNotifications.add(notificationId);

  // 1. Immediately ACK To Stop Exponential Backoff Retry (5s → 15s → 45s)
  socket.emit("notification_ack", { notificationId });

  // 2. Route To The Correct Screen Based On Type
  switch (type) {
    case "NEGOTIATION_REQ":   navigateTo("NewRequestScreen", data);   break;
    case "USER_ACCEPTED":     navigateTo("StartDrivingScreen", data);  break;
    case "USER_REJECTED":     navigateTo("StandbyScreen");             break;
    case "USER_CANCELLED":    navigateTo("StandbyScreen");             break;
    case "DRIVER_ACCEPTED":   navigateTo("DriverMatchedScreen", data); break;
    case "DRIVER_REJECT_ORD": navigateTo("DiscoveryScreen");           break;
    case "DRIVER_FINISHED":   navigateTo("FeedbackScreen", data);      break;
  }
});

// Listen For OTP — This Is A Mission-Critical Separate Event
socket.on("otp_received", (payload) => {
  const { notificationId, data } = payload;

  // Guard: Skip If Already Seen
  if (seenNotifications.has(notificationId)) return;
  seenNotifications.add(notificationId);

  // 1. Immediately ACK To Stop Retry Engine
  socket.emit("notification_ack", { notificationId });

  // 2. Show OTP — Do NOT Store This In State Or Storage
  showOtpModal(data.otp); // Display Briefly On Screen For Patient To Read
});
```

---

## 🗺 Full Trip Lifecycle (End-to-End)

```
[USER]                              [SERVER]                         [DRIVER]
  │                                    │                                │
  ├── GET /orders/nearby ──────────────►│                                │
  │◄── { drivers, surgePricing } ──────┤                                │
  │                                    │                                │
  ├── POST /orders ────────────────────►│                                │
  │◄── { orderId, version, status } ───┤  (Save orderId AND version!)   │
  │                                    │                                │
  ├── Socket: initiate_negotiation ────►│                                │
  │◄── ACK: { sessionId } ─────────────┤                                │
  │                                    ├── notification_received ───────►│
  │                                    │   (type: NEGOTIATION_REQ)      │
  │                                    │                                │
  │   ┌──── Bidding via `negotiation_respond` (counter/accept/reject) ──►│
  │   │     Server broadcasts `negotiation_update` to all room parties   │
  │   └─────────────────────────────────────────────────────────────────►│
  │                                    │                                │
  │◄── notification_received ──────────┤                                │
  │   (type: DRIVER_ACCEPTED)          ├── notification_received ───────►│
  │   → navigate to DriverMatchedScreen│   (type: USER_ACCEPTED)        │
  │                                    │                                │
  │   [Driver drives to pickup]        │                                │
  │◄── trip_location_update (live) ────┤◄── driver_location_update ─────┤
  │                                    │                                │
  │                                    │◄── PATCH /:id/arrived ─────────┤
  │◄── otp_received ───────────────────┤                                │
  │   (data.otp: "7381")               │                                │
  │   → SHOW OTP ON SCREEN             │                                │
  │   → socket.emit notification_ack   │                                │
  │                                    │                                │
  │                                    │◄── PATCH /:id/start { otp } ───┤
  │                                    │   (Driver enters OTP verbally) │
  │◄── trip_status_update: pickup_started                               │
  │                                    │                                │
  │   [Trip in progress]               │                                │
  │                                    │◄── PATCH /:id/complete ────────┤
  │◄── notification_received ──────────┤                                │
  │   (type: DRIVER_FINISHED)          │                                │
  │   → navigate to FeedbackScreen     │                                │
```

---

## 💡 Implementation Rules (Non-Negotiable)

1. **Always ACK**: Send `notification_ack` immediately after **every** `notification_received` and `otp_received`. Missing this causes the server retry engine to re-send the event at 5s → 15s → 45s intervals.
2. **Use Sequence Numbers**: Every notification payload has a `sequence` (integer). If `seq: 5` arrives before `seq: 4`, buffer it and process in ascending order.
3. **Deduplicate by `notificationId`**: On socket reconnect, the server re-delivers all `PENDING` notifications. Use a `Set` in memory to track processed `notificationId`s and skip duplicates.
4. **Never Store OTP**: The OTP from `otp_received` must **never** be stored in local state, AsyncStorage, or anywhere. Display it on screen and discard.
5. **Replay Protection on Every Emit**: Include `timestamp: Date.now()` and a unique random `nonce` string in every socket `emit`. Events older than 30s are rejected.
6. **Token Refresh**: On any `401` HTTP response, call `POST /auth/refresh-token` with the `refreshToken`, then retry the original request with the new `accessToken`.
7. **Save `version` from Orders**: The `version` field in any order response is the OCC guard. Always pass the most recent `version` when initiating a new negotiation.

> [!IMPORTANT]
> **Field Name Consistency**: Always use `ambulanceType` (never `vehicleType`). Use `latitude`/`longitude` (lower case) in REST body payloads. Use `lat`/`lng` in all socket emit payloads.

---

*NeoSaver API Specification — Last Updated: 2026-03-26* 🚑📡🔔💎🚀
