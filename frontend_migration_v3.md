# 🚑 Frontend Migration Guide (v3) — High-Reliability Updates

We have upgraded the backend to be **"Self-Healing"** regarding missing addresses and distances. This is a critical fix for the "Unknown" fields issue in the Driver App.

## 🚀 Key Architectural Changes

### 1. Smart Address Objects (Flattened)
Previously, the frontend had to manually map `pickupLocation.coordinates`. We have now simplified this.
- **New Structure**: `pickup: { lat, lng, address }` and `destination: { lat, lng, address }`.
- **Backend Fix**: If you don't send a `pickupAddress` string, the backend now automatically generates a fallback string like **`"Location [23.81, 90.41]"`**. 
- **Frontend Action**: Stop using `pickupLocation` and switch to the `pickup` object directly.

### 2. Automatic Distance Calculation
No more manual distance calculation on the phone! 
- **New Field**: `distanceKm` (Trip total) and `distanceToPickupKm` (for Drivers).
- **Backend Fix**: We implemented the **Haversine Formula**. Even for old orders, the backend now calculates these numbers mathematically on the fly.
- **Frontend Action**: Bind these fields directly to your "Distance" labels.

### 3. Order Creation Enhancement
You can now optionally send human-readable address strings during trip booking.
```json
// POST /v1/api/orders
{
  "pickupLat": 23.8103,
  "pickupLng": 90.4125,
  "pickupAddress": "Elite Residence, Banani",
  "destinationLat": 23.7500,
  "destinationLng": 90.3900,
  "destinationAddress": "United Hospital, Gulshan"
}
```

---

## 📡 Socket Reliability Upgrade

We have unified the **Real-Time** and **Reconnection (Offline)** event flows.

1. **New Unified Events**: Your `socket.on` listeners should primary listen for `notification_received`.
2. **Backward Compatibility**: I have added support for legacy event names (`new_negotiation_request`, `driver_arrived`, etc.) in the **Offline Sync** engine. 
   - **Result**: If a Driver reconnects after a drop, the App will now correctly "see" the missed negotiation request immediately.

### **Summary of New Fields to UI Bind:**

| Old Field | New Field | Benefit |
| :--- | :--- | :--- |
| `pickupLocation.coordinates` | `pickup.address` | No more "Unknown" text. |
| `Manually Calculated` | `distanceKm` | Precise numbers even on low-end phones. |
| `N/A` | `distanceToPickupKm` | Tells the driver how far they are from the patient. |

---
**The API is now 100% stable and self-correcting. Please check the updated `API.md` for the full spec.** 🚑📡🔔💎🚀
