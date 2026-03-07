# 🚑 NeoSaver V1.0 - Ambulance Dispatch & Management Engine (Server)

### 📌 Orchestration Overview
This is the high-performance Backend API Engine for **NeoSaver**, a life-saving ambulance dispatch ecosystem designed for the **People’s Republic of Bangladesh**. This project marks a significant social-impact initiative where I served as the **Primary Backend Architect**, responsible for the core dispatch logic, real-time safety protocols, and secure data orchestration. 

While the frontend was implemented by a collaborative partner, I architected this server using a **Domain-Based Vertical Slice Architecture**. This approach ensures absolute decoupling between different business domains (e.g., Orders vs. Auth), making the system production-ready, highly maintainable, and industrially resilient.

---

### 🏛 Industrial Architecture & Implementation
**Pattern: Modular Domain-Based Vertical Slice**  
Unlike traditional MVC, the codebase is segmented into **Bounded Contexts**. This prevents "God Objects" and ensures that the system can scale as new features (like hospital integrations or oxygen tracking) are added.

1.  **Domain Modules**: Self-contained slices (Auth, Partner, Order, etc.) containing their own Controllers, Services, and Repositories.
2.  **Infrastructure & Core**: A centralized layer for Database management (MongoDB), Real-time Socket Hubs, and Global Error handling.
3.  **Delivery Layer**: Unified Versioned Routing (V1 API) protecting the business domain from external technological shifts.

#### 🛰 The Real-Time Dispatch Engine
The core strength of NeoSaver lies in its geographic dispatch logic:
*   **Geographic Discovery**: Dynamically filtering online partners based on coverage areas.
*   **Socket-Driven Handshaking**: Real-time order requests sent to drivers with a 30-second logic-based acceptance window.
*   **State Machine Enforcement**: A strictPatrol logic that manages the life cycle of a trip (Arrived -> Started -> Completed).

---

### 🛠 Tech Stack
#### **High-Performance Core**
*   **Node.js & Express**: Scalable runtime and minimalist framework for rapid API delivery.
*   **MongoDB (Native Driver)**: High-availability document store for flexible ambulance and user profiles.
*   **Socket.io**: Persistent bi-directional communication for mission-critical location tracking.
*   **Pino**: Structured, ultra-fast logging with environment-specific levels.

#### **Security & Logistics**
*   **JWT (Dual-Token Strategy)**: Secure Access and Refresh tokens for high-security, long-lived sessions.
*   **Bcrypt**: State-of-the-art password hashing (12 rounds) for local credential security.
*   **ImgBB API**: Automated asset delegation for ambulance and profile verification images.
*   **Nodemailer**: Automated SMTP orchestration for secure password recovery.

---

### 🚀 Installation & Local Baseline
Initialize the secure environment on your local machine.

#### **Prerequisites**
*   Node.js (v18.0+)
*   MongoDB Instance (Local or Atlas)
*   ImgBB API Key
*   SMTP Credentials (Gmail)

#### **1. Clone & Entry**
```bash
git clone https://github.com/Al-Roman23/neosaver-server.git
cd neosaver-server
```

#### **2. Dependency Resolution**
```bash
npm install
```

#### **3. Environment Configuration (.env)**
Create a `.env` in the root directory with the following blueprint:

```env
# Infrastructure
PORT=5000
NODE_ENV=development

# Database (MongoDB)
DB_USER=your_user
DB_PASS=your_password
DB_NAME=SaverDB

# Security
JWT_SECRET="YOUR_LONG_RANDOM_SECRET"
REFRESH_TOKEN_EXPIRES_IN="30d"

# Third-Party APIs
IMGBB_API_KEY=your_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_google_app_password

# Client Pointer
CLIENT_URL=http://localhost:5173
```

#### **4. Launch Development Tunnel**
```bash
npm run dev
```

---

### 📂 Project Structure Hierarchy
```text
src/
├── config/           # Database Connection & Configuration
├── core/             # Global Error Handlers & Socket Services
├── middlewares/      # JWT, Role, & Status Guards
├── modules/          # Bounded Contexts (Vertical Slices)
│   ├── auth/         # Registry, Login, Token Management
│   ├── order/        # Dispatch Engine & Trip Workflow
│   ├── partner/      # Onboarding & Status Management
│   ├── user/         # Identity & Profile Management
│   └── feedback/     # Social Proof & Quality Control
│   └── contact/      # Contact Management
│   └── notification/ # Notification Management
├── routes/           # Unified API Gateway (v1 Index)
└── utils/            # Common Helpers (Email, JWT, ImgBB)
```

---

### 👨‍💻 Primary Developer
**Muhammad Al-Roman Molla**  
*System Architect | Backend Specialist*  
**A Project for the People’s Republic of Bangladesh**

Email: [alromanmolla@gmail.com](mailto:alromanmolla@gmail.com)  
LinkedIn: [al-roman](https://www.linkedin.com/in/al-roman)  
Phone: 01319694957

*"Architecting secure bridges between life-saving data and those who need it most."* — Made with ❤️ by Muhammad Al-Roman Molla
