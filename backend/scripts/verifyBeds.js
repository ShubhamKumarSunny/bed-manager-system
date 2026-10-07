// Quick verification script to check bed structure
const mongoose = require("mongoose");
require("dotenv").config();

const Bed = require("../models/Bed");

async function verifyBeds() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    const beds = await Bed.find({});
    
    console.log(`📊 Total Beds: ${beds.length}\n`);
    
    // Check by ward
    const icuBeds = beds.filter(b => b.ward === 'ICU');
    const generalBeds = beds.filter(b => b.ward === 'General');
    const emergencyBeds = beds.filter(b => b.ward === 'Emergency');
    
    console.log("Ward Distribution:");
    console.log(`  ICU: ${icuBeds.length} beds`);
    console.log(`  General: ${generalBeds.length} beds`);
    console.log(`  Emergency: ${emergencyBeds.length} beds\n`);
    
    // Sample bed IDs from each ward
    console.log("Sample Bed IDs:");
    console.log(`  ICU: ${icuBeds.slice(0, 3).map(b => b.bedId).join(', ')}...`);
    console.log(`  General: ${generalBeds.slice(0, 3).map(b => b.bedId).join(', ')}...`);
    console.log(`  Emergency: ${emergencyBeds.slice(0, 3).map(b => b.bedId).join(', ')}...\n`);
    
    // Check status distribution
    const occupied = beds.filter(b => b.status === 'occupied');
    const available = beds.filter(b => b.status === 'available');
    const cleaning = beds.filter(b => b.status === 'cleaning');
    
    console.log("Status Distribution:");
    console.log(`  Occupied: ${occupied.length} (${(occupied.length/beds.length*100).toFixed(1)}%)`);
    console.log(`  Available: ${available.length} (${(available.length/beds.length*100).toFixed(1)}%)`);
    console.log(`  Cleaning: ${cleaning.length} (${(cleaning.length/beds.length*100).toFixed(1)}%)\n`);
    
    // Sample occupied bed details
    const sampleOccupied = occupied[0];
    if (sampleOccupied) {
      console.log("Sample Occupied Bed:");
      console.log(`  Bed: ${sampleOccupied.bedId} (${sampleOccupied.ward})`);
      console.log(`  Patient: ${sampleOccupied.patientName} (${sampleOccupied.patientId})`);
      if (sampleOccupied.estimatedDischargeTime) {
        console.log(`  Discharge: ${new Date(sampleOccupied.estimatedDischargeTime).toLocaleString()}`);
      }
      console.log();
    }
    
    console.log("✅ Verification complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

verifyBeds();
