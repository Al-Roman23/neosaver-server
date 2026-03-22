// This Script Seeds 9 Drivers Around Dhaka For Testing
require("dotenv").config();
const { connectDB } = require("./src/config/db");
const AuthService = require("./src/modules/auth/auth.service");
const PartnerService = require("./src/modules/partner/partner.service");

// Dhaka Center Coordinates (approx 23.8103, 90.4125)
const DHAKA_LOCATIONS = [
  { name: "Gulshan Driver (Very Close)", lat: 23.805, lng: 90.415 },
  { name: "Banani Driver (Close)", lat: 23.794, lng: 90.404 },
  { name: "Mohakhali Driver (A bit further)", lat: 23.778, lng: 90.400 },
  { name: "Mirpur Driver (Further)", lat: 23.822, lng: 90.365 },
  { name: "Uttara Driver (Far)", lat: 23.875, lng: 90.393 },
  { name: "Dhanmondi Driver (Far)", lat: 23.746, lng: 90.374 },
  { name: "Motijheel Driver (Far)", lat: 23.725, lng: 90.418 },
  { name: "Savar Driver (Very Far)", lat: 23.847, lng: 90.258 },
  { name: "Narayanganj Driver (Extremely Far)", lat: 23.623, lng: 90.500 },
];

async function seedDrivers() {
  console.log("Connecting to Database...");
  await connectDB();

  console.log("Seeding 9 Drivers in Dhaka...");

  for (let i = 0; i < DHAKA_LOCATIONS.length; i++) {
    const loc = DHAKA_LOCATIONS[i];
    const email = `driver${i + 1}_dhaka@neosaver.local`;
    const phone = `+88019${String(i).padStart(8, '0')}`;

    console.log(`Creating ${loc.name}...`);

    try {
      // 1. Register User Auth
      const { user } = await AuthService.registerUser({
        name: loc.name,
        firstName: "Test",
        lastName: "Driver",
        email: email,
        phone: phone,
        password: "Password123!",
        address: "Dhaka",
        postCode: "1200",
        role: "driver",
        acceptedTerms: true,
      });

      // 2. Add Partner Details
      await PartnerService.registerPartner(user._id, {
        ambulanceType: i % 2 === 0 ? "ICU Support" : "Advanced",
        licenseNumber: `DL-DK-${i}`,
        roadTaxToken: `RT-${i}`,
        nationalId: `199012345678${i}`,
        vehicleNumber: `DHK-11-223${i}`,
        coverageArea: "Dhaka",
        contactNumber: phone,
        email: email,
        companyName: "Dhaka Test Hospital",
      });

      // 3. Update Location (puts them on the map)
      await PartnerService.updateLocation(user._id, loc.lat, loc.lng);

    } catch (err) {
      console.log(`Failed for ${email}. Maybe already exists? Skiping to next.`);
    }
  }

  console.log("✅ FINISHED! All 9 Drivers are Live on the map.");
  process.exit(0);
}

seedDrivers();
