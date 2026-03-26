# 🚑 NeoSaver Core Engine — High-Reliability Ambulance Dispatch & Event System

## 🌟 Project Vision
NeoSaver is a mission-critical **Emergency Response Ecosystem** designed for the **People’s Republic of Bangladesh**. This backend core handles the high-stakes coordination between patients in distress and life-saving ambulance partners.

The architecture moves beyond simple "booking" into **High-Integrity Negotiation & Event Delivery**, ensuring every second counts. This is not just a server; it is a **Reliability-First State Machine**.

---

## 🏛️ Advanced Engineering Architecture

### 🛡️ 1. Elite Event Delivery Engine (Reliability Layer)
The standout feature of this system is its custom-built **Notification Reliability Engine**. Designed to survive network drops and client crashes, it features:
*   **ACK-Aware Delivery**: The server tracks client receipts (`notification_ack`). If a client doesn't acknowledge within we recover via background retry.
*   **Exponential Backoff Retries**: High-priority events (NEGOTIATION_REQ, OTP_RECEIVED) automatically retry at 5s, 15s, and 45s intervals if the socket is unstable.
*   **Atomic Sequencing**: Every event is assigned a globally ordered `sequence` number (scoped to Order + User), allowing the frontend to reconstruct the exact timeline regardless of network jitter.
*   **Context-Aware Idempotency**: MD5-hashed idempotency keys prevent duplicate notifications for the same state change, even under heavy retry loads.

### 🤝 2. Real-Time Negotiation Protocol
A sophisticated bidding system that facilitates fair-market discovery:
*   **Concurrency Guard**: Drivers are atomically locked (`isNegotiating: true`) during active bids to prevent double-booking.
*   **Transcript Persistence**: Every bid, counter-bid, and rejection is logged to a permanent audit trail for administrative review and analytics.
*   **Three-Round Protocol**: Enforces a strict 3-round limit on negotiations to ensure decisions are made rapidly during medical emergencies.

### 🌍 3. Intelligent Geo-Discovery
*   **Hybrid Heartbeat Discovery**: Beyond simple "Online" status, the engine tracks **`lastAppHeartbeatAt`** to allow a **5-minute Background Grace Period**, ensuring drivers who switch apps (e.g., to Google Maps) remain visible.
*   **Scarcity-Based Surge Pricing**: Automatically calculates suggested fares based on real-time driver density in the local area.
*   **Re-discovery Cooldown**: Implements a "Cooldown Strategy" where recently-contacted drivers are hidden from discovery for 2 minutes — unless they are the only drivers nearby, maintaining a balance between user choice and driver variety.

---

## 🔐 Security & Integrity Standard

*   **Socket Replay Defense**: All state-changing socket events require a `timestamp` + `nonce` signature, validated against a 30s sliding window.
*   **Optimistic Concurrency (OCC)**: Every status change relies on a strict `version` field check, preventing race conditions where two updates hit the server simultaneously.
*   **Identity Guard**: Strict uniqueness enforcement on **National ID (NID)** and **Vehicle Licenses** at the database level.
*   **Zero-Trust OTP Flow**: Trips are mathematically impossible to start until the Driver verifies a secure 4-digit OTP provided by the User at the point of arrival.

---

## 🛠️ Technical Ecosystem

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | **Node.js (LTS)** | High-performance asynchronous execution. |
| **Framework**| **Express.js** | Minimalist, modular API gateway. |
| **Persistence**| **MongoDB** | Schema-less flexibility with **2dsphere Geospatial Indexing**. |
| **Real-time** | **Socket.io** | Bi-directional communication with **Room Partitioning**. |
| **Logging** | **Pino** | Structured, JSON-based high-speed logging. |
| **Security** | **Helmet / CORS / JWT** | Deep-defense profiling for modern web threats. |
| **Dev Tools** | **OpenAPI (Swagger)** | Definitive REST documentation and schema validation. |

---

## 📂 Project Hierarchy
```text
src/
├── config/           # Database, Geospatial Indexes, TTL Strategies
├── core/             # Global Error Handlers, Socket Services, Background Pulse Workers
├── middlewares/      # JWT Rotation, RBAC (Role-Based Access), Replay Attack Defense
├── modules/          # Bounded Contexts (Auth, Partner, Order, Notification, Negotiation)
├── routes/           # Versioned API Gateway (V1)
└── utils/            # JWT Generation, Security Nonce Verification, Structured Logging
```

---

## 🚀 Verification & Testing
The system includes an **Exhaustive Integration Test Suite** (`test.js`) that simulates the entire lifecycle of a medical emergency:
```bash
# Verify 100% Of All API Routes and Socket Logic
node test.js
```
The test covers four distinct scenarios including **Success paths**, **Max Round Blockers**, **User Abandonment**, and **Notification Idempotency**.

---

## 👨‍💻 Developed By
**Muhammad Al-Roman Molla**  
*Full-Stack Engineer | Systems Architect*  

**"Architecting secure bridges between life-saving data and those who need it most."** — Built for the People's Republic of Bangladesh.

📧 [alromanmolla@gmail.com](mailto:alromanmolla@gmail.com)  
🔗 [LinkedIn Profile](https://www.linkedin.com/in/al-roman)  
