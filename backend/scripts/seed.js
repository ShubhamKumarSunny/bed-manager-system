// backend/scripts/seed.js
// Seeds the database with a realistic demo hospital: beds, staff accounts,
// 30 days of occupancy + cleaning history, emergency requests and alerts.
//
//   npm run seed            (uses MONGO_URI from backend/.env)
//
// WARNING: this wipes every collection used by the app.

require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Bed = require('../models/Bed');
const User = require('../models/User');
const OccupancyLog = require('../models/OccupancyLog');
const CleaningLog = require('../models/CleaningLog');
const EmergencyRequest = require('../models/EmergencyRequest');
const Alert = require('../models/Alert');
const Report = require('../models/Report');

const DEMO_PASSWORD = 'demo1234';
const HISTORY_DAYS = 30;
// Beds start empty, so simulate a couple of extra weeks and discard them:
// the kept history then starts at a realistic, steady occupancy.
const WARMUP_DAYS = 14;
const HOUR = 3600 * 1000;
const MINUTE = 60 * 1000;
const now = new Date();

// Per-ward behaviour: length of stay range (hours), mean idle gap between
// patients (hours) and how many beds should be mid-cleaning right now.
const WARDS = {
  ICU: { los: [60, 168], gap: 12, cleaningNow: 2 },
  General: { los: [36, 120], gap: 14, cleaningNow: 5 },
  Emergency: { los: [12, 60], gap: 8, cleaningNow: 4 }
};

const USERS = [
  { name: 'Dr. Sarah Chen', email: 'admin@hospital.com', role: 'hospital_admin', department: 'Administration' },
  { name: 'Anuradha Patel', email: 'manager.icu@hospital.com', role: 'manager', ward: 'ICU', department: 'Critical Care' },
  { name: 'Rohan Mehta', email: 'manager.general@hospital.com', role: 'manager', ward: 'General', department: 'General Medicine' },
  { name: 'Priya Nair', email: 'manager.emergency@hospital.com', role: 'manager', ward: 'Emergency', department: 'Emergency Medicine' },
  { name: 'Kavya Reddy', email: 'staff.icu@hospital.com', role: 'ward_staff', ward: 'ICU', department: 'Critical Care' },
  { name: 'Arjun Singh', email: 'staff.general@hospital.com', role: 'ward_staff', ward: 'General', department: 'General Medicine' },
  { name: 'Meera Iyer', email: 'staff.emergency@hospital.com', role: 'ward_staff', ward: 'Emergency', department: 'Emergency Medicine' },
  { name: 'Vikram Rao', email: 'er@hospital.com', role: 'er_staff', ward: 'Emergency', department: 'Emergency Room' },
  { name: 'Tech Support', email: 'tech@hospital.com', role: 'technical_team', department: 'IT' }
];

const FIRST_NAMES = ['Aarav', 'Ananya', 'Vivaan', 'Diya', 'Aditya', 'Ishita', 'Kabir', 'Saanvi', 'Rahul', 'Neha', 'Karan', 'Pooja', 'Siddharth', 'Riya', 'Manish', 'Sneha', 'Amit', 'Divya', 'Rajesh', 'Lakshmi', 'John', 'Sarah', 'Michael', 'Emma', 'David', 'Fatima', 'Imran', 'Grace'];
const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Kumar', 'Das', 'Banerjee', 'Joshi', 'Kapoor', 'Menon', 'Pillai', 'Chatterjee', 'Agarwal', 'Bose', 'Desai', 'Khan', 'Fernandes', 'Thomas', 'Smith', 'Mishra', 'Yadav'];
const CONDITIONS = ['Chest pain', 'Respiratory distress', 'Acute abdominal pain', 'Head injury', 'Cardiac event', 'Stroke symptoms', 'Severe bleeding', 'Road traffic accident', 'High fever with seizures', 'Diabetic ketoacidosis'];
const LOCATIONS = ['ER Bay 1', 'ER Bay 2', 'ER Bay 3', 'Trauma Room', 'Triage'];

// Hourly admission weights (index = hour of day) - busier late morning and evening
const HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 3, 5, 7, 9, 10, 10, 8, 7, 7, 8, 9, 10, 9, 7, 5, 4, 2, 1];

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const patientName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
const patientId = () => `P${random(10000, 99999)}`;

function weightedHour() {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let h = 0; h < 24; h++) {
    r -= HOUR_WEIGHTS[h];
    if (r <= 0) return h;
  }
  return 12;
}

// Move a timestamp forward to a realistic hour of the day (never backwards, so a
// bed is not re-admitted before its previous patient left)
function atRealisticHour(date) {
  const d = new Date(date);
  d.setHours(weightedHour(), random(0, 59), random(0, 59), 0);
  if (d < date) d.setDate(d.getDate() + 1);
  return d;
}

function buildBeds() {
  const beds = [];
  const add = (rows, perRow, ward, prefix = '') => rows.forEach((row) => {
    for (let i = 1; i <= perRow; i++) beds.push({ bedId: `${prefix}${row}${i}`, ward });
  });
  add(['A', 'B'], 12, 'ICU', 'i'); // iA1-iB12
  add(['A', 'B', 'C', 'D'], 21, 'General'); // Floor 1
  add(['E', 'F', 'G', 'H'], 21, 'Emergency'); // Floor 2
  return beds;
}

// Walk one bed forward through HISTORY_DAYS of stays and return its logs + current state
function simulateBed(bed, staffId, forceCleaning) {
  const { los, gap } = WARDS[bed.ward];
  const occupancyLogs = [];
  const cleaningLogs = [];
  const state = { status: 'available' };

  let t = new Date(now.getTime() - (HISTORY_DAYS + WARMUP_DAYS) * 24 * HOUR + random(0, gap * 2) * HOUR);

  while (t < now) {
    const admitted = atRealisticHour(t);
    if (admitted >= now) break; // next patient has not arrived yet
    const stayHours = random(los[0], los[1]);
    const discharged = new Date(admitted.getTime() + stayHours * HOUR + random(0, 59) * MINUTE);

    occupancyLogs.push({ bedId: bed._id, userId: staffId, statusChange: 'assigned', timestamp: admitted });

    if (discharged >= now) {
      Object.assign(state, {
        status: 'occupied',
        patientName: patientName(),
        patientId: patientId(),
        estimatedDischargeTime: discharged
      });
      break;
    }

    occupancyLogs.push({ bedId: bed._id, userId: staffId, statusChange: 'released', timestamp: discharged });

    const estimated = pick([20, 30, 30, 45]);
    const actual = Math.max(10, Math.round(estimated * (0.6 + Math.random() * 0.55)));
    const cleanedAt = new Date(discharged.getTime() + actual * MINUTE);
    if (cleanedAt < now) {
      cleaningLogs.push({
        bedId: bed._id,
        ward: bed.ward,
        startTime: discharged,
        endTime: cleanedAt,
        estimatedDuration: estimated,
        actualDuration: actual,
        status: 'completed',
        assignedTo: staffId,
        completedBy: staffId
      });
      occupancyLogs.push({ bedId: bed._id, userId: staffId, statusChange: 'maintenance_end', timestamp: cleanedAt });
    }

    t = new Date(cleanedAt.getTime() + random(Math.round(gap * 0.3), Math.round(gap * 1.7)) * HOUR);
  }

  // Put a handful of free beds into "cleaning" so the cleaning queue has live data
  if (forceCleaning && state.status === 'available') {
    const start = new Date(now.getTime() - random(4, 22) * MINUTE);
    const estimated = pick([20, 30, 45]);
    occupancyLogs.push({ bedId: bed._id, userId: staffId, statusChange: 'released', timestamp: start });
    cleaningLogs.push({
      bedId: bed._id,
      ward: bed.ward,
      startTime: start,
      endTime: null,
      estimatedDuration: estimated,
      actualDuration: null,
      status: 'in_progress',
      assignedTo: staffId,
      completedBy: null
    });
    Object.assign(state, {
      status: 'cleaning',
      cleaningStartTime: start,
      estimatedCleaningDuration: estimated,
      estimatedCleaningEndTime: new Date(start.getTime() + estimated * MINUTE)
    });
  }

  const historyStart = new Date(now.getTime() - HISTORY_DAYS * 24 * HOUR);
  return {
    occupancyLogs: occupancyLogs.filter((log) => log.timestamp >= historyStart),
    cleaningLogs: cleaningLogs.filter((log) => log.startTime >= historyStart),
    state
  };
}

const stamped = (docs, field) => docs.map((doc) => ({ ...doc, createdAt: doc[field], updatedAt: doc[field] }));

async function seed() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/bedmanager';
  await mongoose.connect(uri);
  console.log(`✅ Connected to ${mongoose.connection.name}`);

  await Promise.all([Bed, User, OccupancyLog, CleaningLog, EmergencyRequest, Alert, Report].map((m) => m.deleteMany({})));
  console.log('🗑  Cleared existing data');

  // Users (insertMany skips the pre-save hook, so hash here)
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = await User.insertMany(USERS.map((u) => ({ ...u, password, isDemo: true })));
  const staffByWard = Object.fromEntries(
    users.filter((u) => u.role === 'ward_staff').map((u) => [u.ward, u._id])
  );
  console.log(`👤 Created ${users.length} users`);

  // Beds
  const beds = await Bed.insertMany(buildBeds());

  const occupancyLogs = [];
  const cleaningLogs = [];
  const bedUpdates = [];
  const cleaningQuota = Object.fromEntries(Object.entries(WARDS).map(([w, c]) => [w, c.cleaningNow]));

  for (const bed of beds) {
    const result = simulateBed(bed, staffByWard[bed.ward], cleaningQuota[bed.ward] > 0);
    if (result.state.status === 'cleaning') cleaningQuota[bed.ward]--;
    occupancyLogs.push(...result.occupancyLogs);
    cleaningLogs.push(...result.cleaningLogs);
    if (result.state.status !== 'available') {
      bedUpdates.push({ updateOne: { filter: { _id: bed._id }, update: { $set: result.state } } });
    }
  }

  await Bed.bulkWrite(bedUpdates);
  // lean: skip per-document validators (each one would hit the database)
  await OccupancyLog.insertMany(stamped(occupancyLogs, 'timestamp'), { lean: true });
  await CleaningLog.insertMany(stamped(cleaningLogs, 'startTime'), { lean: true });
  console.log(`🛏  Created ${beds.length} beds, ${occupancyLogs.length} occupancy logs, ${cleaningLogs.length} cleaning logs`);

  // Emergency requests: a live pending queue per ward plus recent history
  const requests = [];
  const makeRequest = (ward, status, hoursAgo, priority) => {
    const createdAt = new Date(now.getTime() - hoursAgo * HOUR - random(0, 50) * MINUTE);
    return {
      patientName: patientName(),
      patientContact: `+91 9${random(100000000, 999999999)}`,
      location: pick(LOCATIONS),
      ward,
      priority: priority || pick(['critical', 'high', 'medium', 'medium', 'low']),
      reason: pick(CONDITIONS),
      description: 'Patient stabilised in ER, awaiting ward bed.',
      status,
      createdAt,
      updatedAt: status === 'pending' ? createdAt : new Date(createdAt.getTime() + random(5, 40) * MINUTE)
    };
  };
  Object.keys(WARDS).forEach((ward) => {
    requests.push(makeRequest(ward, 'pending', 0, 'critical'));
    requests.push(makeRequest(ward, 'pending', 1, 'high'));
    requests.push(makeRequest(ward, 'pending', 2, 'medium'));
    for (let i = 0; i < 6; i++) requests.push(makeRequest(ward, 'approved', random(3, 96)));
    for (let i = 0; i < 2; i++) requests.push(makeRequest(ward, 'rejected', random(3, 96)));
  });
  const savedRequests = await EmergencyRequest.insertMany(requests, { timestamps: false });

  // Alerts for the pending requests + ward level notices
  const alerts = savedRequests
    .filter((r) => r.status === 'pending')
    .map((r) => ({
      type: 'request_pending',
      severity: r.priority,
      message: `Emergency bed request for ${r.patientName} at ${r.location} (${r.ward} ward)`,
      relatedRequest: r._id,
      ward: r.ward,
      targetRole: ['manager', 'hospital_admin'],
      timestamp: r.createdAt
    }));

  for (const ward of Object.keys(WARDS)) {
    const total = await Bed.countDocuments({ ward });
    const occupied = await Bed.countDocuments({ ward, status: 'occupied' });
    const rate = (occupied / total) * 100;
    if (rate >= 80) {
      alerts.push({
        type: 'occupancy_high',
        severity: rate >= 90 ? 'critical' : 'high',
        message: `${ward} ward occupancy at ${rate.toFixed(1)}% (${occupied}/${total} beds occupied)`,
        ward,
        targetRole: ['manager', 'hospital_admin'],
        timestamp: new Date(now.getTime() - random(10, 90) * MINUTE)
      });
    }
    console.log(`   ${ward.padEnd(10)} ${occupied}/${total} occupied (${rate.toFixed(0)}%)`);
  }
  await Alert.insertMany(alerts);
  console.log(`🚑 Created ${savedRequests.length} emergency requests and ${alerts.length} alerts`);

  console.log('\n🎉 Seed complete. Demo accounts (password for all: ' + DEMO_PASSWORD + ')');
  USERS.forEach((u) => console.log(`   ${u.role.padEnd(15)} ${u.email}`));

  await mongoose.connection.close();
}

seed().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
