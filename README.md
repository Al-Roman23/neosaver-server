# 🚑 NeoSaver Core Engine — Primary Ambulance Dispatch & Negotiation System (Server)

### 📌 Project Context
This is the mission-critical **Backend API Engine** for **NeoSaver**, a life-saving ambulance dispatch ecosystem designed for the **People’s Republic of Bangladesh**.

The system is built on a sophisticated **Manual Driver Selection & Multi-Round Bidding Protocol**. This ensures fair pricing, maximizes driver availability, and provides users with a transparent selection process during medical emergencies. Unlike automated dispatch models, this architecture prioritizes the human element of negotiation to find the best possible match for every urgent trip.

### 🌍 Production Registry
*   **Live Backend URL**: `https://neosaver-server.onrender.com/v1/api`
*   **Live WebSocket URL**: `https://neosaver-server.onrender.com`
*   **Live Health Status**: `https://neosaver-server.onrender.com/health`

---

### 🏛 Advanced Industrial Architecture
**Pattern: Distributed Modular Domain-Based Vertical Slice**  
The system is built as a **Modular Monolith**, segmented into **Bounded Contexts**. This ensures that the business logic for "Negotiation" is entirely decoupled from "User Profiles" or "Auth," allowing for independent scaling and maintenance.

#### 🧠 The SSOT State Machine
*   **Single Source of Truth (SSOT)**: The `Order` document is the absolute source of truth. All sub-processes (Negotiations) are ephemeral handlers that transactionally update the main trip lifecycle.
*   **Optimistic Concurrency Control (OCC)**: Every state-changing operation uses a `version` field and atomic MongoDB updates (`findOneAndUpdate`) to prevent race conditions and "double-booking" in a high-concurrency environment.
*   **Global Reconciliation Pulse**: A dedicated **Background Worker** (30s Heartbeat) monitors the cluster for stale driver locks, expired negotiations, and "ghost" trips, ensuring the system "auto-heals" after network drops or client crashes.

---

### 🔥 Mission-Critical Features
1.  **Manual Selection Discovery**: Users can discover nearby online verified drivers with real-time distance and **Scarcity-based Surge Pricing metadata**. The discovery engine uses a **two-step aggregation pipeline** — first attempting to exclude recently-attempted drivers (cooldown), then falling back to the full pool if no alternatives exist, ensuring the user is never left without options.
2.  **Privacy-First Handshake**: Before trip acceptance, only the User's **Name** is shared with drivers. Contact details are strictly hidden to ensure safety during the bidding phase.
3.  **Real-Time Proximity Pulse**: Drivers emit live GPS coordinates every 5s, which are transformed into **`distanceMeters`** and **`estimateArrivalMins`** (ETA) for the User.
4.  **Proactive OTP Delivery**: The system pushes the secure 4-digit OTP to the User **immediately** when the driver marks their arrival (`driver_arrived` socket event).
5.  **Admin Bidding Audit**: A dedicated history engine (`GET /negotiations/history/:orderId`) allows administrators to review the full 3-round bidding transcript of any trip.
6.  **Identity Integrity**: Strict uniqueness enforcement on **National ID (NID)** and **Driver License** numbers at the database level to prevent fraudulent accounts.
7.  **Atomic Driver Locking**: Drivers are atomically locked during a negotiation (`isNegotiating: true`) to prevent "Phantom Bids" and ensure dedicated attention.
8.  **Driver Retry Cooldown Strategy**: After a failed or rejected negotiation, the driver's ID and timestamp are recorded in `attemptedDrivers` (capped at last 20 entries). A **2-minute cooldown** prevents spam re-negotiation, while a **fallback mechanism** ensures the driver reappears in discovery if no other drivers are nearby — preventing false "no drivers available" scenarios.
9.  **Zero-Trust OTP Verification**: Trips cannot begin until the Driver verifies a 4-digit OTP provided by the User, ensuring a secure "Patient-in-Ambulance" confirmation.

---

### 🛠 Tech Stack & Security
#### **High-Performance Core**
*   **Node.js & Express**: Scalable runtime and minimalist API framework.
*   **MongoDB (Native Driver)**: High-speed document store utilizing **2dsphere Geospatial Indexes** for proximity search.
*   **Socket.io**: Persistent bi-directional communication with **Namespace Partitioning**.
*   **Pino**: Structured, ultra-fast logging with Correlation ID tracking.

#### **Security Hardening**
*   **Replay Attack Defense**: Nonce-based security guards for all state-changing WebSocket events with **TTL-based automatic cleanup**.
*   **Military-Grade Headers**: Helmet.js injects 11 security headers; CORS strictly restricts cross-origin resource sharing.
*   **JWT (Dual-Token Rotation)**: Secure Access and Refresh tokens for long-lived, high-security sessions.
*   **Identity Guard**: Unique Indexing on sensitive document fields (NID, License, Email, Phone).

---

### 📂 Structural Hierarchy
```text
src/
├── config/           # DB Connection, Geospatial Indexing, TTL Cleanup
├── core/             # Global Error Handlers, Socket Hub, Pulse Worker
├── middlewares/      # JWT, RBAC, Rate Limiting, Replay Protection
├── modules/          # Bounded Contexts (Vertical Slices)
├── routes/           # Unified API Gateway (Versioned Index)
└── utils/            # Common Helpers (Email, JWT, Security Nonces)
```

---

### 🚀 Rapid Start & Verification
1.  **Install Dependencies**: `npm install`
2.  **Configure `.env`**: (Follow the Blueprint in `.env.example`)
3.  **Launch Primary Server**: `npm start`
4.  **Exhaustive E2E Verification**:
    ```bash
    node exhaustive_test.js
    ```
    *This script verifies 100% of the system paths (Discovery → Negotiation → Bidding → Rejection → Cooldown Tracking → Re-discovery → OTP → Completion).*

---

### 👨‍💻 Primary Developer & Architect
**Muhammad Al-Roman Molla**  
*System Architect | Backend Specialist*  
**A Project for the People’s Republic of Bangladesh**

Email: [alromanmolla@gmail.com](mailto:alromanmolla@gmail.com)  
LinkedIn: [al-roman](https://www.linkedin.com/in/al-roman)  
Phone: 01319694957

---
*"Architecting secure bridges between life-saving data and those who need it most."* — Made with ❤️ by Muhammad Al-Roman Molla
