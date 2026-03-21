const axios = require('axios');

async function verifyDriverDiscovery() {
    const BASE_URL = "http://localhost:5000/v1/api";
    
    try {
        // 1. Register a Test User to get a token
        console.log("🔄 Step 1: Registering Test User...");
        const userEmail = `testuser${Date.now()}@example.com`;
        const userReg = await axios.post(`${BASE_URL}/auth/register`, {
            name: "Proof User", email: userEmail, phone: `+88017${Math.floor(Math.random()*100000000)}`,
            password: "Password123!", address: "Dhaka", postCode: "1000", role: "user", acceptedTerms: true
        });
        const token = userReg.data.data.accessToken;

        // 2. Call Nearby Drivers Endpoint
        console.log("🔄 Step 2: Querying Nearby Drivers...");
        const response = await axios.get(`${BASE_URL}/orders/nearby?pickupLat=22.816&pickupLng=89.552`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const drivers = response.data.data.drivers;
        
        if (drivers && drivers.length > 0) {
            console.log("\n✅ PROOF: Driver Discovery Data Structure Found!");
            console.log("--------------------------------------------------");
            drivers.slice(0, 2).forEach((driver, index) => {
                console.log(`Driver #${index + 1}: ${driver.name}`);
                console.log(`- Ambulance Type: ${driver.ambulanceType}`);
                console.log(`- Completed Orders: ${driver.completedOrderCount} (This is what the frontend sees!)`);
                console.log(`- Rating: ${driver.rating}`);
                console.log("--------------------------------------------------");
            });
        } else {
            console.log("❌ No online drivers found in the area. Please ensure a driver is 'online' in the database.");
        }

    } catch (error) {
        console.error("❌ Verification Failed:", error.response?.data || error.message);
    }
}

verifyDriverDiscovery();
