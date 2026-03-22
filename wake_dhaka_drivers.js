// This Script Wakes Up All Frozen "Zombie" Drivers in Dhaka
require("dotenv").config();
const { connectDB } = require("./src/config/db");

async function wakeDrivers() {
  console.log("Connecting to Database to Wake Drivers...");
  const db = await connectDB();
  const partnersCollection = db.collection("partners");

  console.log("Locating all 'zombie' drivers mapped to Dhaka...");

  // Force everyone in Dhaka back online, resetting their heartbeat
  const result = await partnersCollection.updateMany(
    { coverageArea: { $in: ["Dhaka", "Khulna"] } },
    {
      $set: {
        isOnline: true,
        currentStatus: "online",
        lastAppHeartbeatAt: new Date(),
        updatedAt: new Date()
      }
    }
  );

  console.log(`✅ SUCCESS! Resurrected ${result.modifiedCount} zombie drivers from the dead!`);
  console.log("They are now fully online, fresh, and ready for you to test `GET /orders/nearby`.");

  process.exit(0);
}

wakeDrivers();
