// Cleanup Script — Run This After Any Crashed Test To Reset Driver State
const { connectDB, getCollection } = require("./src/config/db");
const { ObjectId } = require("mongodb");

// --- CONFIGURATION (Update Order ID Each Time) ---
const DRIVER_USER_ID = "69c0064edd0fd583422e1fda";
const ORDER_ID = "PASTE_YOUR_ORDER_ID_HERE"; // Your Most Recent Order ID
// -------------------------------------------------

async function reset() {
    try {
        await connectDB();

        // 1. Unlock Driver
        const partners = await getCollection("partners");
        const driverResult = await partners.updateOne(
            { userId: new ObjectId(DRIVER_USER_ID) },
            { $set: { isNegotiating: false, isAvailable: true, currentOrderId: null, negotiationLockExpiresAt: null, updatedAt: new Date() } }
        );
        console.log(`✅ Driver Unlocked: ${driverResult.modifiedCount} Document Updated.`);

        // 2. Reset Order Status To Pending
        if (ORDER_ID !== "PASTE_YOUR_ORDER_ID_HERE") {
            const orders = await getCollection("orders");
            const orderResult = await orders.updateOne(
                { _id: new ObjectId(ORDER_ID) },
                { $set: { status: "pending", negotiationId: null, updatedAt: new Date() } }
            );
            console.log(`✅ Order Reset: ${orderResult.modifiedCount} Document Updated.`);
        } else {
            console.log("⚠️ No Order ID Provided — Skipping Order Reset.");
        }

        // 3. Clear All Active Negotiation Sessions For This Driver
        const sessions = await getCollection("negotiation_sessions");
        const sessionResult = await sessions.updateMany(
            { driverId: DRIVER_USER_ID, status: "active" },
            { $set: { status: "rejected", endedReason: "manual_cleanup", updatedAt: new Date() } }
        );
        console.log(`✅ Stale Sessions Cleared: ${sessionResult.modifiedCount} Sessions Closed.`);

        console.log("\n🚀 Cleanup Complete! You Can Now Run test1.js Or test2.js.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup Failed:", err.message);
        process.exit(1);
    }
}

reset();
