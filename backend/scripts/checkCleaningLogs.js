// Script to check CleaningLog entries
const mongoose = require('mongoose');
const CleaningLog = require('../models/CleaningLog');
require('dotenv').config();

const checkCleaningLogs = async () => {
  try {
    const dbURI = process.env.MONGO_URI || 'mongodb://localhost:27017/bedmanager';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(dbURI);
    console.log('✅ Connected to MongoDB\n');

    const total = await CleaningLog.countDocuments();
    const inProgress = await CleaningLog.countDocuments({ status: 'in_progress' });
    const completed = await CleaningLog.countDocuments({ status: 'completed' });

    console.log(`📊 CleaningLog Statistics:`);
    console.log(`   Total entries: ${total}`);
    console.log(`   In-progress: ${inProgress}`);
    console.log(`   Completed: ${completed}\n`);

    if (total > 0) {
      const recent = await CleaningLog.find()
        .sort({ startTime: -1 })
        .limit(10)
        .populate('assignedTo', 'name email')
        .populate('bedId', 'bedId ward status');

      console.log('📝 Recent CleaningLog entries (last 10):');
      recent.forEach((log, i) => {
        const bed = log.bedId ? `Bed ${log.bedId.bedId} (${log.bedId.ward})` : 'Bed not found';
        const assignedTo = log.assignedTo ? log.assignedTo.name || log.assignedTo.email : 'Unassigned';
        console.log(`   ${i+1}. ${bed}`);
        console.log(`      Status: ${log.status}`);
        console.log(`      Started: ${new Date(log.startTime).toLocaleString()}`);
        console.log(`      Assigned to: ${assignedTo}`);
        if (log.endTime) {
          console.log(`      Completed: ${new Date(log.endTime).toLocaleString()}`);
        }
        console.log('');
      });

      // Check for orphaned logs (where bed is in 'maintenance' status or doesn't exist)
      console.log('🔍 Checking for orphaned cleaning logs...');
      const orphaned = await CleaningLog.find({ status: 'in_progress' }).populate('bedId');
      const orphanedLogs = orphaned.filter(log => !log.bedId || log.bedId.status !== 'cleaning');
      
      if (orphanedLogs.length > 0) {
        console.log(`⚠️ Found ${orphanedLogs.length} orphaned in-progress logs (bed not in cleaning status):`);
        orphanedLogs.forEach((log, i) => {
          const bedStatus = log.bedId ? log.bedId.status : 'bed deleted';
          console.log(`   ${i+1}. Log ID: ${log._id} - Bed status: ${bedStatus}`);
        });
        console.log('\n💡 These logs should be marked as completed or removed.');
      } else {
        console.log('✅ No orphaned logs found!');
      }
    }

    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

checkCleaningLogs();
