/**
 * TEST 2: 3-ROUND BIDDING -> DRIVER ACCEPTS
 * Instructions: 
 * 1. Ensure 'socket.io-client' is installed (npm install socket.io-client)
 * 2. Paste your tokens below
 * 3. Run: node test2.js
 */

const { io } = require("socket.io-client");

// --- CONFIGURATION (Change these by hand) ---
const SERVER_URL = "https://neosaver-server.onrender.com"; // Or your Render URL
const USER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YjU5YjQ0YjQzY2E3YjQyYjE3YjY2YSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQxMzQ2MzI0LCJleHAiOjE3NDEzNDk5MjR9.Y19970wX9_l93j945922K_5661379615718772618";
const DRIVER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YjU5YjQ0YjQzY2E3YjQyYjE3YjY2YSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQxMzQ2MzI0LCJleHAiOjE3NDEzNDk5MjR9.Y19970wX9_l93j945922K_5661379615718772618";

const ORDER_ID = "69c0240c5924b2f4b58cd5af";
const DRIVER_ID = "69c0064edd0fd583422e1fda";
// --------------------------------------------

const userSocket = io(SERVER_URL, { auth: { token: USER_TOKEN }, transports: ["websocket"], reconnection: false });
const driverSocket = io(SERVER_URL, { auth: { token: DRIVER_TOKEN }, transports: ["websocket"], reconnection: false });

let sessionId = null;

const getMeta = () => ({ timestamp: Date.now(), nonce: Math.random().toString(36).substring(7) });

console.log("🚀 Starting Test 2 (Bidding -> Acceptance)...");

userSocket.on("connect", () => {
    console.log("✅ User Connected");

    // Step 1: Initiate Negotiation
    userSocket.emit("initiate_negotiation", {
        orderId: ORDER_ID,
        driverId: DRIVER_ID,
        version: 1,
        ...getMeta()
    }, (res) => {
        if (!res.success) return console.error("❌ Initiation Failed:", res.message);
        sessionId = res.sessionId;
        console.log("💎 Negotiation Initiated! Session ID:", sessionId);

        // Step 2: Driver Offers 1800 (Seq 1)
        setTimeout(() => {
            console.log("📢 Driver Bidding 1800 (Seq 1)");
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1800, sequence: 1, ...getMeta() });
        }, 1000);
    });
});

userSocket.on("negotiation_update", (data) => {
    const { amount, sequence } = data;
    console.log(`📩 Received Update: Amount ${amount}, Seq ${sequence}`);

    if (sequence === 1) {
        setTimeout(() => {
            console.log("📢 User Counter-Bidding 1600 (Seq 2)");
            userSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1600, sequence: 2, ...getMeta() });
        }, 1000);
    }

    if (sequence === 3) {
        setTimeout(() => {
            console.log("📢 User Counter-Bidding 1650 (Seq 4)");
            userSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1650, sequence: 4, ...getMeta() });
        }, 1000);
    }

    if (sequence === 5) {
        setTimeout(() => {
            console.log("📢 User Final Bid 1700 (Seq 6)");
            userSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1700, sequence: 6, ...getMeta() });
        }, 1000);
    }
});

driverSocket.on("negotiation_update", (data) => {
    const { sequence } = data;

    if (sequence === 2) {
        setTimeout(() => {
            console.log("📢 Driver Counter-Bidding 1750 (Seq 3)");
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1750, sequence: 3, ...getMeta() });
        }, 1000);
    }

    if (sequence === 4) {
        setTimeout(() => {
            console.log("📢 Driver Bid 1720 (Seq 5)");
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1720, sequence: 5, ...getMeta() });
        }, 1000);
    }

    // FINAL STEP: Driver ACCEPTS User's Seq 6 bid
    if (sequence === 6) {
        setTimeout(() => {
            console.log("🏁 Driver ACCEPTING negotiation (Success!)...");
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "accept", sequence: 7, ...getMeta() });
        }, 1000);
    }
});

userSocket.on("negotiation_finalized", (data) => {
    console.log("🛑 Negotiation Ended with Status:", data.status);
    process.exit(0);
});
