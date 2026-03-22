/**
 * TEST 1: 3-ROUND BIDDING -> DRIVER REJECTS
 * Instructions: 
 * 1. Ensure 'socket.io-client' is installed (npm install socket.io-client)
 * 2. Paste your tokens below
 * 3. Run: node test1.js
 */

const { io } = require("socket.io-client");

// --- CONFIGURATION (Change these by hand) ---
const SERVER_URL = "https://neosaver-server.onrender.com"; // Or your Render URL
const USER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmZlYzFlMjQxOTlkZGU5MTFiNzAxZCIsImVtYWlsIjoiYWxyb21hbjEyMTUyMDA0QGdtYWlsLmNvbSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc0MTk5NzM4LCJleHAiOjE3NzQyMDMzMzh9.pXpBkBTQhPYEFtilS0idgOXRbx2IMby2BdCT49WlRXg";
const DRIVER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzAwNjRlZGQwZmQ1ODM0MjJlMWZkYSIsImVtYWlsIjoiYWxyb21hbjIwMDQxMjE1QGdtYWlsLmNvbSIsInJvbGUiOiJkcml2ZXIiLCJpYXQiOjE3NzQxOTk2NjAsImV4cCI6MTc3NDIwMzI2MH0.tghsHvRAAcwn2d4mXEGWdwr0b54054CJhpAP4ja1-oo";

const ORDER_ID = "69c0293e63029d1a7de635f1";
const DRIVER_ID = "69c0064edd0fd583422e1fda";
// --------------------------------------------

const userSocket = io(SERVER_URL, { auth: { token: USER_TOKEN }, transports: ['websocket'] });
const driverSocket = io(SERVER_URL, { auth: { token: DRIVER_TOKEN }, transports: ['websocket'] });

let sessionId = null;

const getMeta = () => ({ timestamp: Date.now(), nonce: Math.random().toString(36).substring(7) });

console.log("🚀 Starting Test 1 (Bidding -> Rejection)...");

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
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1800, sequence: 1, ...getMeta() }, (ack) => {
                if (!ack.success) console.error("❌ Driver Bid 1 Failed", ack.message);
            });
        }, 1000);
    });
});

userSocket.on("negotiation_update", (data) => {
    const { round, amount, sequence } = data;
    console.log(`📩 Received Update: Round ${round}, Amount ${amount}, Seq ${sequence}`);

    // Round 1 User Counter 1600 (responding to Driver Seq 1)
    if (sequence === 1) {
        setTimeout(() => {
            console.log("📢 User Counter-Bidding 1600 (Seq 2)");
            userSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1600, sequence: 2, ...getMeta() });
        }, 1000);
    }

    // Round 2 User Counter 1650 (responding to Driver Seq 3)
    if (sequence === 3) {
        setTimeout(() => {
            console.log("📢 User Counter-Bidding 1650 (Seq 4)");
            userSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1650, sequence: 4, ...getMeta() });
        }, 1000);
    }

    // Round 3 User Final Bid 1700 (responding to Driver Seq 5)
    if (sequence === 5) {
        setTimeout(() => {
            console.log("📢 User Final Bid 1700 (Seq 6)");
            userSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1700, sequence: 6, ...getMeta() });
        }, 1000);
    }
});

driverSocket.on("negotiation_update", (data) => {
    const { sequence } = data;

    // Round 2 Driver Counter 1750 (responding to User Seq 2)
    if (sequence === 2) {
        setTimeout(() => {
            console.log("📢 Driver Counter-Bidding 1750 (Seq 3)");
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1750, sequence: 3, ...getMeta() });
        }, 1000);
    }

    // Round 3 Driver Bid 1720 (responding to User Seq 4)
    if (sequence === 4) {
        setTimeout(() => {
            console.log("📢 Driver Bid 1720 (Seq 5)");
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "bid", amount: 1720, sequence: 5, ...getMeta() });
        }, 1000);
    }

    // FINAL STEP: Driver REJECTS User's Seq 6 bid
    if (sequence === 6) {
        setTimeout(() => {
            console.log("🏁 Driver REJECTING negotiation (End of 3 rounds)...");
            driverSocket.emit("negotiation_respond", { sessionId, orderId: ORDER_ID, action: "reject", sequence: 7, ...getMeta() });
        }, 1000);
    }
});

userSocket.on("negotiation_finalized", (data) => {
    console.log("🛑 Negotiation Ended with Status:", data.status);
    process.exit(0);
});

userSocket.on("connect_error", (err) => console.error("User Socket Error:", err.message));
driverSocket.on("connect_error", (err) => console.error("Driver Socket Error:", err.message));
