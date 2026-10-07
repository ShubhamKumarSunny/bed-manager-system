// Script to fix beds in cleaning status without proper fields
const mongoose = require('mongoose');
const Bed = require('../models/Bed');
const CleaningLog = require('../models/CleaningLog');
const User = require('../models/User');
require('dotenv').config();

const fixCleaningBeds = async () => {
  try {
    const dbURI = process.env.MONGO_URI || 'mongodb://localhost:27017/bedmanager';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(dbURI);
    console.log('✅ Connected to MongoDB\n');

    // Find beds in cleaning status without proper fields
    const problematicBeds = await Bed.find({ 
      status: 'cleaning',
      $or: [
        { cleaningStartTime: null },
        { cleaningStartTime: { $exists: false } },
        { estimatedCleaningDuration: null },
        { estimatedCleaningDuration: { $exists: false } }
      ]
    });

    console.log(`📊 Found ${problematicBeds.length} bed(s) needing fixes\n`);

    if (problematicBeds.length === 0) {
      console.log('✅ All cleaning beds have proper fields set!');
      await mongoose.connection.close();
      return;
    }

    // Find a manager user to assign the cleaning log
    const manager = await User.findOne({ role: 'manager' });
    const assignedToId = manager ? manager._id : null;

    console.log('🔧 Fixing beds...\n');

    for (const bed of problematicBeds) {
      console.log(`  Fixing Bed ${bed.bedId} (Ward: ${bed.ward})...`);
      
      // Set cleaning fields
      const now = new Date();
      const duration = 30; // 30 minutes default
      
      bed.cleaningStartTime = now;
      bed.estimatedCleaningDuration = duration;
      bed.estimatedCleaningEndTime = new Date(now.getTime() + duration * 60 * 1000);
      
      await bed.save();
      console.log(`    ✅ Set cleaning fields (30 min duration)`);

      // Create CleaningLog if it doesn't exist
      const existingLog = await CleaningLog.findOne({
        bedId: bed._id,
        status: 'in_progress'
      });

      if (!existingLog && assignedToId) {
        await CleaningLog.create({
          bedId: bed._id,
          ward: bed.ward,
          startTime: now,
          estimatedDuration: duration,
          status: 'in_progress',
          assignedTo: assignedToId
        });
        console.log(`    ✅ Created CleaningLog entry`);
      } else if (!existingLog) {
        console.log(`    ⚠️  Could not create CleaningLog (no manager found)`);
      } else {
        console.log(`    ℹ️  CleaningLog already exists`);
      }
      
      console.log('');
    }

    console.log(`✨ Fixed ${problematicBeds.length} bed(s)!`);
    console.log('   Beds now have proper cleaning fields and will show progress.\n');

    await mongoose.connection.close();
    console.log('🔌 Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

fixCleaningBeds();
