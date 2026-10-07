// Script to clean up old 'maintenance' status from MongoDB
// This will update all beds with status 'maintenance' to 'available'

const mongoose = require('mongoose');
const Bed = require('../models/Bed');
require('dotenv').config();

const cleanupMaintenanceStatus = async () => {
  try {
    // Connect to MongoDB
    const dbURI = process.env.MONGO_URI || 'mongodb://localhost:27017/bedmanager';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(dbURI);
    console.log('✅ Connected to MongoDB');

    // Find all beds with 'maintenance' status
    const maintenanceBeds = await Bed.find({ status: 'maintenance' });
    console.log(`\n📊 Found ${maintenanceBeds.length} beds with 'maintenance' status`);

    if (maintenanceBeds.length === 0) {
      console.log('✅ No beds with maintenance status found. Database is clean!');
      await mongoose.connection.close();
      return;
    }

    // Display beds that will be updated
    console.log('\n🔍 Beds to be updated:');
    maintenanceBeds.forEach((bed, index) => {
      console.log(`   ${index + 1}. Bed ${bed.bedId} (Ward: ${bed.ward})`);
    });

    // Update all maintenance beds to available
    console.log('\n🔄 Updating beds to "available" status...');
    const result = await Bed.updateMany(
      { status: 'maintenance' },
      { 
        $set: { 
          status: 'available',
          cleaningStartTime: null,
          estimatedCleaningDuration: null,
          estimatedCleaningEndTime: null,
          patientName: null,
          patientId: null
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} beds successfully!`);
    
    // Verify the update
    const remainingMaintenanceBeds = await Bed.find({ status: 'maintenance' });
    console.log(`\n🔍 Verification: ${remainingMaintenanceBeds.length} beds still have 'maintenance' status`);

    if (remainingMaintenanceBeds.length === 0) {
      console.log('✅ All maintenance status entries have been cleaned up!');
    } else {
      console.log('⚠️ Some beds still have maintenance status. Please check manually.');
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    console.log('✨ Cleanup complete!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

// Run the cleanup
cleanupMaintenanceStatus();
