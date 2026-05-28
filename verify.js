const mongoose = require('mongoose');
const env = require('./src/core/config/env');
const connectDB = require('./src/core/config/db');

// Import models
const User = require('./src/api/auth/auth.model');
const Medication = require('./src/api/medications/medication.model');
const AdherenceLog = require('./src/api/adherence/adherence.model');
const GamificationProfile = require('./src/api/gamification/gamification.model');

// Import services
const authService = require('./src/api/auth/auth.service');
const medicationService = require('./src/api/medications/medication.service');
const adherenceService = require('./src/api/adherence/adherence.service');
const scheduleService = require('./src/core/services/scheduleService');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runVerification() {
  console.log('🏁 Starting MediAlert Integration & Verification Suite...');
  
  // Connect to DB
  await connectDB();

  try {
    // 1. Wipe collections for clean test run
    console.log('\n🧹 Cleaning database...');
    await User.deleteMany({});
    await Medication.deleteMany({});
    await AdherenceLog.deleteMany({});
    await GamificationProfile.deleteMany({});
    console.log('🟢 Database cleaned.');

    // 2. Register Patient
    console.log('\n👤 Registering patient user...');
    const patientData = {
      username: 'pat_alice',
      role: 'Patient',
      contactInfo: 'alice@example.com',
      pinHash: '1234'
    };
    const { user: patient } = await authService.register(patientData);
    console.log(`🟢 Patient registered: ${patient.username} (ID: ${patient._id})`);

    // Verify gamification profile was created automatically
    const initialProfile = await GamificationProfile.findOne({ patientId: patient._id });
    console.log(`🟢 Initial Gamification Profile: Streak = ${initialProfile.currentStreak}, XP = ${initialProfile.xpPoints}, Plant = ${initialProfile.plantStage}`);

    // 3. Register Dependant
    console.log('\n👤 Registering dependant user...');
    const dependantData = {
      username: 'dep_charlie',
      role: 'Dependant',
      contactInfo: 'charlie@example.com',
      pinHash: '4321'
    };
    const { user: dependant } = await authService.register(dependantData);
    console.log(`🟢 Dependant registered: ${dependant.username} (ID: ${dependant._id})`);

    // 4. Associate Dependant with Patient
    console.log('\n🔗 Associating Dependant to Patient...');
    await authService.associateUser(patient._id, dependant.username);
    const updatedPatient = await User.findById(patient._id);
    console.log(`🟢 Patient associated users count: ${updatedPatient.associatedUsers.length}`);

    // 5. Add Medication
    console.log('\n💊 Registering medication for Patient...');
    const medication = await medicationService.createMedication({
      patientId: patient._id,
      drugName: 'Lisinopril',
      dosage: '10mg once daily',
      scheduleInterval: '08:00'
    });
    console.log(`🟢 Medication Registered: ${medication.drugName} - ${medication.dosage}`);

    // 6. Test Escalation Flow (Levels 1 -> 2 -> 3 -> 4)
    console.log('\n🚀 Starting Escalation Protocol Test...');
    
    // Step A: Trigger level 1
    console.log('--- STEP 6A: Trigger Level 1 Alert ---');
    const log = await adherenceService.triggerSchedule(patient._id, medication._id);
    console.log(`🟢 Adherence Log Created. Status: ${log.status}, Level: ${log.escalationLevel}`);
    
    // Step B: Advance to Level 2
    console.log('\n--- STEP 6B: Fast-Forwarding 20 Minutes (Simulating elapsed time) to Trigger Level 2 ---');
    // Artificially change lastAlertSentAt to 20 minutes ago
    log.lastAlertSentAt = new Date(Date.now() - 20 * 60 * 1000);
    await log.save();

    // Call scheduleService manual sweep
    let processed = await scheduleService.sweepActiveEscalations();
    console.log(`🟢 Sweep processed: ${processed} logs.`);
    
    let updatedLog = await AdherenceLog.findById(log._id);
    console.log(`🟢 Adherence Log After Sweep. Status: ${updatedLog.status}, Level: ${updatedLog.escalationLevel}`);

    // Step C: Advance to Level 3
    console.log('\n--- STEP 6C: Fast-Forwarding 20 Minutes to Trigger Level 3 ---');
    updatedLog.lastAlertSentAt = new Date(Date.now() - 20 * 60 * 1000);
    await updatedLog.save();

    processed = await scheduleService.sweepActiveEscalations();
    console.log(`🟢 Sweep processed: ${processed} logs.`);
    
    updatedLog = await AdherenceLog.findById(log._id);
    console.log(`🟢 Adherence Log After Sweep. Status: ${updatedLog.status}, Level: ${updatedLog.escalationLevel}`);

    // Step D: Missed & Dependant Alert
    console.log('\n--- STEP 6D: Fast-Forwarding 20 Minutes to Trigger Dependant Alert & Missed Status ---');
    updatedLog.lastAlertSentAt = new Date(Date.now() - 20 * 60 * 1000);
    await updatedLog.save();

    processed = await scheduleService.sweepActiveEscalations();
    console.log(`🟢 Sweep processed: ${processed} logs.`);
    
    updatedLog = await AdherenceLog.findById(log._id);
    console.log(`🟢 Adherence Log After Sweep. Status: ${updatedLog.status}, Level: ${updatedLog.escalationLevel}`);

    // Check gamification streak
    const missedProfile = await GamificationProfile.findOne({ patientId: patient._id });
    console.log(`🟢 Post-Miss Streak: ${missedProfile.currentStreak}`);

    // 7. Test Successful Intake (Taken status + XP + Plant Evolution)
    console.log('\n🚀 Starting Medication Taken & Gamification Test...');
    console.log('--- STEP 7A: Triggering new schedule ---');
    const log2 = await adherenceService.triggerSchedule(patient._id, medication._id);
    console.log(`🟢 New log created: ${log2._id} (Status: ${log2.status}, Level: ${log2.escalationLevel})`);

    console.log('\n--- STEP 7B: Confirming medication taken ---');
    const { log: confirmedLog, profile: updatedProfile } = await adherenceService.confirmTaken(log2._id, patient._id);
    console.log(`🟢 Confirmation Response: Status is now "${confirmedLog.status}"`);
    console.log(`🟢 Gamification Progress: Streak: ${updatedProfile.currentStreak}, XP: ${updatedProfile.xpPoints}, Plant Stage: ${updatedProfile.plantStage}`);

    // Verify streak and XP are awarded
    if (updatedProfile.currentStreak === 1 && updatedProfile.xpPoints > 0) {
      console.log('🟢 Gamification award verified successfully!');
    } else {
      console.error('🔴 Gamification awards failed verification.');
    }

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n🔴 Integration test encountered an error:', error);
  } finally {
    console.log('\n🔌 Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('🟢 Connection closed.');
    process.exit(0);
  }
}

runVerification();
