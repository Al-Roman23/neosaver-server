# This document provides all the endpoints and WebSocket events needed to integrate the NeoSaver application.

## 🌍 Global Base URLs
- **Production API**: `https://neosaver-server.onrender.com/v1/api`
- **WebSocket**: `https://neosaver-server.onrender.com`

---

## 🔑 Authentication Domain
**Base URL**: `{BASE_URL}/auth`

| Action | Method | Path | Body Fields | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Register** | POST | `/register` | `name`, `firstName`, `lastName`, `email`, `phone`, `password`, `address`, `postCode`, `role` ("user"/"driver"), `acceptedTerms` (bool) | Returns tokens and user object. |
| **Login** | POST | `/login` | `identifier` (email or phone), `password` | Returns `accessToken` and `refreshToken`. |
| **Refresh Token** | POST | `/refresh-token` | `refreshToken` | Use this when `accessToken` expires. |
| **Forgot Password** | POST | `/forgot-password` | `email` | Initiates email flow. |
| **Logout** | POST | `/logout` | `refreshToken` | Blacklists the refresh token. |

---

## 👤 User Profile Domain
**Base URL**: `{BASE_URL}/user` (Requires Authorization Header)

| Action | Method | Path | Body Fields | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Get Profile** | GET | `/profile` | N/A | Returns current user details. |
| **Update Profile**| PUT | `/profile` | `name`, `email`, `phone`, `address` | Partial updates allowed. |
| **Upload Image** | POST | `/profile/image`| `image` (Multipart/File) | Updates Profile Picture. Supports All Image Formats (Png, Jpeg, Webp, Gif). |

---

## 🚑 Partner (Driver) Domain
**Base URL**: `{BASE_URL}/partner` (Requires Authorization Header)

| Action | Method | Path | Body Fields | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Save Details** | POST | `/details` | `ambulanceType`, `vehicleNumber`, `licenseNumber`, `roadTaxToken`, `nationalId`, `vehicleNumber`, `coverageArea`, `contactNumber`, `email`, `companyName` | **Mandatory** For Driver Verification. |
| **Get Profile** | GET | `/profile` | N/A | Fetch partner-specific data. |
| **Update Profile**| PUT | `/profile` | `ambulanceType`, `vehicleNumber`, `coverageArea`, etc. | Updates partner record. |
| **Update Status** | PATCH| `/status` | `currentStatus` ("online"/"offline") | Controls visibility to users. |
| **Location PUSH** | PATCH| `/profile/location`| `latitude`, `longitude` | HTTP fallback for location updates. |

---

## 🤝 Negotiation Domain
**Base URL**: `{BASE_URL}/negotiations` (Requires Authorization Header)

| Action | Method | Path | Body Fields | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Initiate** | POST | `/initiate` | `orderId`, `driverId`, `version` | **User Only**: Start a bidding session. Returns `sessionId`. |
| **Audit History** | GET | `/history/:id`| N/A | **Admin Only**: Retrieve full bidding transcript for an order. |

---

## 📦 Order Domain
**Base URL**: `{BASE_URL}/orders` (Requires Authorization Header)

| Action | Method | Path | Body Fields | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Discover Nearby** | GET | `/nearby` | N/A (Queries: `pickupLat`, `pickupLng`) | **User Only**: Returns drivers + Surge Pricing. Supports **5-min Background Grace Period**. |
| **Create Order** | POST | `/` | `pickupLat`, `pickupLng`, `destinationLat`, `destinationLng`, `notes` | **User**: Starts a fresh Pending order. |
| **Active Order** | GET | `/active` | N/A | **User**: Current trip context. Includes **Driver Profile** once Accepted. |
| **Order Details** | GET | `/:id` | N/A | **Shared**: Full order doc. **Access Relaxation**: Drivers can view this IF they are in an active negotiation for this order. |
| **Cancel Order** | DELETE | `/:id` | N/A | **User/Driver**: Cancel order. Atomic status update. |
| **Arrived** | PATCH| `/:id/arrived` | N/A | **Driver**: Notify user. Triggers `driver_arrived` socket event with **OTP**. |
| **Start Trip** | PATCH| `/:id/start` | `otp` (String) | **Driver**: Requires 4-digit OTP from User UI. Validates and starts transit. |
| **Complete Trip**| PATCH| `/:id/complete`| N/A | **Driver**: Terminates order successfully. |

---

## 📈 Full Order Life Cycle

### **1. Discovery & Order Entry**
- User fetches `GET /orders/nearby` to see available drivers and surge pricing.
- User submits `POST /orders` to create a `pending` order.

### **2. Negotiation (The Handshake)**
- User initiates a session via `POST /negotiations/initiate` or Socket `initiate_negotiation`.
- **Atomic Locking**: The driver is locked for this user. Concurrent bids from other users for this driver will return `409 Conflict`.
- **Access Relaxation**: The driver can now call `GET /orders/:id` for this specific trip without a `403` error.

### **3. Bidding & Settlement**
- Both parties exchange bids via Socket `negotiation_respond`.
- **Settlement**: When either party sends `action: "accept"`, the negotiation closes.
- **State Change**: Order status jumps from `pending` to `accepted`.
- Driver `isAvailable` becomes `false`.

### **4. Arrival & Verification**
- Driver marking arrival via `PATCH /orders/:id/arrived` sets status to `arrived`.
- **OTP Generation**: Server pushes the `driver_arrived` event to the User. **The User UI must show this 4-digit OTP to the patient/caller.**

### **5. Transit & Completion**
- Driver asks for the OTP and calls `PATCH /orders/:id/start` with the code.
- Order transitions to `pickup_started`.
- Upon reaching the hospital, Driver calls `PATCH /orders/:id/complete`. 
- **Release**: Driver is marked `isAvailable: true` and is back in the search pool.

---

## 📡 WebSocket Events (Socket.io)
Connect to root URL with `auth: { token: accessToken }`. 
**Security Requirement**: All `emit` calls must include `{ timestamp: Date.now(), nonce: "random_string" }` to prevent replay attacks.

### **Driver Geofencing & Lifecycle:**
- `emit("driver_location_update", { lat, lng })`: Send every 10s-30s.
- `emit("app_state_change", { state: "background" | "foreground" })`: Minimized apps stay in the search pool for **5 minutes (Grace Period)**.

### **Negotiation Flow:**
- `on("new_negotiation_request", (data))`: Driver receives user details and initial price.
- `emit("negotiation_respond", { sessionId, orderId, action, amount, sequence })`:
  - `action`: "counter", "accept", "reject".
- `on("negotiation_update", (data))`: Received by the party waiting for a bid.
- `on("negotiation_settled", { status, order })`: Global signal that the deal is done.

### **Tracking & Notifications:**
- `on("driver_arrived", { otp })`: **Crucial**: User receives the Trip Start OTP code here.
- `on("order_status_update", (data))`: Syncs UI with current backend state.

---

## 💡 Pro-Tips for Frontend Integration

1.  **Replay Protection**: The server enforces a strict "Recent Timestamp + Unique Nonce" check on all socket events. 
2.  **Grace Period**: If a driver minimizes the app, they aren't removed instantly. They have 5 minutes to stay "visible" to users.
3.  **OTP Security**: The OTP is only visible to the User and is pushed via socket only when the driver is within valid range/marks arrived.

> [!IMPORTANT]
> **Field Consistency**: Always use `ambulanceType` (not `vehicleType`) and `isOnline` (not `status`).
