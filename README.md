# 🚑 NeoSaver Core Engine — Primary Ambulance Dispatch & Negotiation System (Server)

### 📌 Project Context
This is the mission-critical **Backend API Engine** for **NeoSaver**, a life-saving ambulance dispatch ecosystem designed for the **People’s Republic of Bangladesh**.

The system is built on a sophisticated **Manual Driver Selection & Multi-Round Bidding Protocol**. This ensures fair pricing, maximizes driver availability, and provides users with a transparent selection process during medical emergencies. Unlike automated dispatch models, this architecture prioritizes the human element of negotiation to find the best possible match for every urgent trip.

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
1.  **Manual Selection Discovery**: Users can discover nearby online drivers with real-time distance and **Scarcity-based Surge Pricing metadata**.
2.  **Multi-Round Bidding Protocol**: A sophisticated WebSocket-driven negotiation flow allowing up to 3 rounds of counter-offers between User and Driver.
3.  **Atomic Driver Locking**: Drivers are atomically locked during a negotiation (`isNegotiating: true`) to prevent "Phantom Bids" and ensure dedicated attention.
4.  **Zero-Trust OTP Verification**: Trips cannot begin until the Driver verifies a 4-digit OTP provided by the User, ensuring a secure "Patient-in-Ambulance" confirmation.
5.  **High-Resolution Analytics**: Track negotiation round outcomes, price deltas, and driver cancellation penalties (`penalty_flag`) for operational optimization.
6.  **Reliable Delivery (Triple-Retry ACK)**: Mission-critical socket events (Order Accepted/Arrived) use a built-in handshake retry logic with fallback to a persistent Offline Notification queue.

---

### 🛠 Tech Stack & Security
#### **High-Performance Core**
*   **Node.js & Express**: Scalable runtime and minimalist API framework.
*   **MongoDB (Native Driver)**: High-speed document store utilizing **2dsphere Geospatial Indexes** for proximity search.
*   **Socket.io**: Persistent bi-directional communication with **Namespace Partitioning**.
*   **Pino**: Structured, ultra-fast logging with Correlation ID tracking.

#### **Security Hardening**
*   **Replay Attack Defense**: Nonce-based security guards for all state-changing WebSocket events (Timestamp + Nonce validation).
*   **JWT (Dual-Token Rotation)**: Secure Access and Refresh tokens for long-lived, high-security sessions.
*   **Role-Based Access Control (RBAC)**: Strict permission guards for `user`, `driver`, and `admin` scopes.
*   **Idempotency Enforcement**: Prevent duplicate transactions across the entire bidding lifecycle.

---

### 📂 Structural Hierarchy
```text
src/
├── config/           # DB Connection, Geospatial Indexing, Logger
├── core/             # Global Error Handlers, Socket Hub, Pulse Worker
├── middlewares/      # JWT, RBAC, Rate Limiting, Replay Protection
├── modules/          # Bounded Contexts (Vertical Slices)
│   ├── negotiation/  # Multi-Round Bidding & Locking Logic
│   ├── analytics/    # KPI Tracking & Driver Penalty Metrics
│   ├── order/        # Manual Selection & OTP Trip Workflow
│   ├── partner/      # Onboarding, Availability & Lock Management
│   ├── user/         # Identity & Profile Management
│   └── feedback/     # Social Proof & Quality Control
├── routes/           # Unified API Gateway (Versioned Index)
└── utils/            # Common Helpers (Email, JWT, Security Nonces)
```

---

### 🚀 Rapid Start & Verification
1.  **Install Dependencies**: `npm install`
2.  **Configure `.env`**: (Follow the Blueprint in `.env.example`)
3.  **Launch Primary Server**: `npm run dev`
4.  **Exhaustive E2E Verification**:
    ```bash
    node exhaustive_test.js
    ```
    *This script verifies 100% of the system paths (Discovery -> Negotiation -> Bidding -> OTP -> Completion).*

---

### 👨‍💻 Primary Developer & Architect
**Muhammad Al-Roman Molla**  
*System Architect | Backend Specialist*  
**A Project for the People’s Republic of Bangladesh**

Email: [alromanmolla@gmail.com](mailto:alromanmolla@gmail.com)  
LinkedIn: [al-roman](https://www.linkedin.com/in/al-roman)  
Phone: 01319694957

*"Architecting secure bridges between life-saving data and those who need it most."* — Made with ❤️ by Muhammad Al-Roman Molla
