// backend/generateReport.js

const mongoose = require("mongoose");
const Bed = require("../models/Bed");
const User = require("../models/User");
const OccupancyLog = require("../models/OccupancyLog");
const CleaningLog = require("../models/CleaningLog");
const EmergencyRequest = require("../models/EmergencyRequest");
const Alert = require("../models/Alert");

// Connect to your database
require("dotenv").config({ quiet: true });
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/bedmanager");

// Utility
const line = () => console.log("---------------------------------------------------------");

async function generateReport() {
  console.log("\n📊 HOSPITAL BED MANAGER – DATA ANALYTICS REPORT");
  console.log("===================================================\n");

  // ---------------------- BED REPORT ----------------------
  console.log("🛏️  BED SUMMARY");
  line();
  const totalBeds = await Bed.countDocuments();
  const wards = await Bed.distinct("ward");

  console.log(`Total Beds: ${totalBeds}`);

  for (let ward of wards) {
    const total = await Bed.countDocuments({ ward });
    const occupied = await Bed.countDocuments({ ward, status: "occupied" });
    const available = await Bed.countDocuments({ ward, status: "available" });
    const cleaning = await Bed.countDocuments({ ward, status: "cleaning" });

    console.log(
      `${ward}: ${total} beds (Occupied: ${occupied}, Available: ${available}, Cleaning: ${cleaning})`
    );
  }

  // Occupancy %
  const occupiedAll = await Bed.countDocuments({ status: "occupied" });
  console.log(
    `\nOverall Occupancy: ${((occupiedAll / totalBeds) * 100).toFixed(2)}%`
  );

  // ---------------------- CLEANING REPORT ----------------------
  console.log("\n🧹 CLEANING SUMMARY");
  line();
  const cleaningLogs = await CleaningLog.aggregate([
    { $group: { _id: null, avg: { $avg: "$actualDuration" }, max: { $max: "$actualDuration" }, min: { $min: "$actualDuration" } } },
  ]);

  const { avg, max, min } = cleaningLogs[0] || { avg: 0, max: 0, min: 0 };

  console.log(`Average Cleaning Time: ${avg.toFixed(1)} minutes`);
  console.log(`Min Cleaning Time: ${min} minutes`);
  console.log(`Max Cleaning Time: ${max} minutes`);

  const cleaningCount = await CleaningLog.countDocuments();
  console.log(`Total Cleaning Events: ${cleaningCount}`);

  // ---------------------- OCCUPANCY LOGS ----------------------
  console.log("\n📘 OCCUPANCY LOG SUMMARY");
  line();

  const totalLogs = await OccupancyLog.countDocuments();
  console.log(`Total Occupancy Events: ${totalLogs}`);

  const logCounts = await OccupancyLog.aggregate([
    { $group: { _id: "$statusChange", count: { $sum: 1 } } },
  ]);

  logCounts.forEach((l) => {
    console.log(`${l._id}: ${l.count}`);
  });

  // ---------------------- EMERGENCY REQUESTS ----------------------
  console.log("\n🚨 EMERGENCY REQUEST SUMMARY");
  line();

  const totalRequests = await EmergencyRequest.countDocuments();
  const pending = await EmergencyRequest.countDocuments({ status: "pending" });
  const approved = await EmergencyRequest.countDocuments({ status: "approved" });
  const rejected = await EmergencyRequest.countDocuments({ status: "rejected" });

  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Approved: ${approved}`);
  console.log(`Pending: ${pending}`);
  console.log(`Rejected: ${rejected}`);

  const mostRequestedWard = await EmergencyRequest.aggregate([
    { $group: { _id: "$ward", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  console.log(
    `Most Requested Ward: ${
      mostRequestedWard[0]?._id
    } (${mostRequestedWard[0]?.count} requests)`
  );

  // ---------------------- USERS ----------------------
  console.log("\n👥 USER SUMMARY");
  line();
  
  const users = await User.aggregate([
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);

  users.forEach((u) => {
    console.log(`${u._id}: ${u.count}`);
  });

  // ---------------------- ALERT SUMMARY ----------------------
  console.log("\n🔔 ALERT SUMMARY");
  line();

  const totalAlerts = await Alert.countDocuments();
  const unread = await Alert.countDocuments({ read: false });

  console.log(`Total Alerts: ${totalAlerts}`);
  console.log(`Unread: ${unread}`);

  const alertTypes = await Alert.aggregate([
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);

  alertTypes.forEach((a) => {
    console.log(`${a._id}: ${a.count}`);
  });

  console.log("\n📌 Report generation completed.\n");
  process.exit(0);
}

generateReport();
