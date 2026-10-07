// Test script to trigger occupancy alerts
// This script updates multiple beds to occupied status to exceed 90% occupancy

require('dotenv').config();
const mongoose = require('mongoose');
const Bed = require('../models/Bed');
const Alert = require('../models/Alert');
const connectDB = require('../config/db');

const testOccupancyAlert = async () => {
  try {
    console.log('🔍 Connecting to database...');
    await connectDB();
    
    // Get ICU beds
    const icuBeds = await Bed.find({ ward: 'ICU' });
    console.log(`📊 Found ${icuBeds.length} ICU beds`);
    
    if (icuBeds.length === 0) {
      console.log('❌ No ICU beds found. Please seed the database first.');
      process.exit(1);
    }
    
    // Calculate how many beds to occupy to exceed 90%
    const totalBeds = icuBeds.length;
    const targetOccupancy = Math.ceil(totalBeds * 0.92); // 92% to exceed 90%
    const currentOccupied = icuBeds.filter(b => b.status === 'occupied').length;
    const bedsToOccupy = Math.max(0, targetOccupancy - currentOccupied);
    
    console.log(`\n📈 Current Occupancy: ${currentOccupied}/${totalBeds} (${((currentOccupied/totalBeds)*100).toFixed(1)}%)`);
    console.log(`🎯 Target Occupancy: ${targetOccupancy}/${totalBeds} (${((targetOccupancy/totalBeds)*100).toFixed(1)}%)`);
    console.log(`🛏️  Beds to occupy: ${bedsToOccupy}`);
    
    if (bedsToOccupy > 0) {
      // Get available beds
      const availableBeds = icuBeds.filter(b => b.status === 'available');
      
      if (availableBeds.length < bedsToOccupy) {
        console.log(`⚠️  Not enough available beds. Only ${availableBeds.length} available.`);
      }
      
      // Occupy the beds
      const bedsToUpdate = availableBeds.slice(0, bedsToOccupy);
      console.log(`\n🔄 Updating ${bedsToUpdate.length} beds to occupied...`);
      
      for (let i = 0; i < bedsToUpdate.length; i++) {
        const bed = bedsToUpdate[i];
        bed.status = 'occupied';
        bed.patientName = `Test Patient ${i + 1}`;
        bed.patientId = `TEST-${Date.now()}-${i + 1}`;
        await bed.save();
        console.log(`  ✅ ${bed.bedId} set to occupied`);
      }
    } else {
      console.log('\n✅ Already at or above target occupancy!');
    }
    
    // Check final occupancy
    const finalBeds = await Bed.find({ ward: 'ICU' });
    const finalOccupied = finalBeds.filter(b => b.status === 'occupied').length;
    const finalOccupancy = (finalOccupied / totalBeds) * 100;
    
    console.log(`\n📊 Final Occupancy: ${finalOccupied}/${totalBeds} (${finalOccupancy.toFixed(1)}%)`);
    
    // Check if alert was created
    const alerts = await Alert.find({ type: 'occupancy_high', ward: 'ICU', read: false });
    console.log(`\n🚨 Occupancy alerts found: ${alerts.length}`);
    
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        console.log(`  - ${alert.severity.toUpperCase()}: ${alert.message}`);
      });
    }
    
    if (finalOccupancy > 90 && alerts.length === 0) {
      console.log('⚠️  WARNING: Occupancy > 90% but no alert created!');
      console.log('   This is expected - alerts are created on bed status update via API, not direct DB changes.');
      console.log('   Use the API endpoint PATCH /api/beds/:id/status to trigger alert creation.');
    }
    
    console.log('\n✅ Test completed!');
    console.log('\n💡 To trigger an alert via API:');
    console.log('   1. Start the backend server: npm run dev');
    console.log('   2. Use the frontend or Postman to update a bed status');
    console.log('   3. The checkOccupancyAndCreateAlerts function will run automatically');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

testOccupancyAlert();
