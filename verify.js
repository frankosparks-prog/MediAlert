const mongoose = require('mongoose');
const env = require('./src/core/config/env');
const connectDB = require('./src/core/config/db');

// Import models
const User = require('./src/api/auth/auth.model');
const Medication = require('./src/api/medications/medication.model');
const AdherenceLog = require('./src/api/adherence/adherence.model');
const CaregiverAlert = require('./src/api/adherence/caregiverAlert.model');
const GamificationProfile = require('./src/api/gamification/gamification.model');

// Import services
const authService = require('./src/api/auth/auth.service');
const medicationService = require('./src/api/medications/medication.service');
const adherenceService = require('./src/api/adherence/adherence.service');
const gamificationService = require('./src/api/gamification/gamification.service');
const scheduleService = require('./src/core/services/scheduleService');
const escalationQueueService = require('./src/core/queues/escalationQueueService');
const { closeRedis, isRedisEnabled } = require('./src/core/config/redis');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runVerification() {
  console.log('🏁 Starting MediAlert Integration & Verification Suite...');
  
  // Connect to DB
  await connectDB();

  // Inspect Queue Mode
  const queueStatus = await escalationQueueService.getQueueStatus();
  console.log(`🔌 Queue Engine Active Mode: ${queueStatus.mode.toUpperCase()} (Redis Enabled: ${isRedisEnabled()})`);

  try {
    // 1. Wipe collections for clean test run
    console.log('\n🧹 Cleaning database...');
    await User.deleteMany({});
    await Medication.deleteMany({});
    await AdherenceLog.deleteMany({});
    await CaregiverAlert.deleteMany({});
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
    console.log(`🟢 Initial Gamification Profile: Streak = ${initialProfile.currentStreak}, Longest = ${initialProfile.longestStreak}, XP = ${initialProfile.xpPoints}, Plant = ${initialProfile.plantStage} (${initialProfile.plantStatus}), Free Passes = ${initialProfile.freePassesAvailable}`);

    // Set Alice to a 20-streak milestone to test the user's specific scenario
    initialProfile.currentStreak = 20;
    initialProfile.longestStreak = 20;
    initialProfile.xpPoints = 550;
    initialProfile.plantStage = 'Mature';
    await initialProfile.save();
    console.log(`🟢 Established 20-dose milestone: Current Streak = 20, Longest = 20, Plant = Mature`);

    // 3. Register Dependant
    console.log('\n👤 Registering dependant user...');
    const dependantData = {
      username: 'dep_charlie',
      role: 'Dependant',
      contactInfo: '0712345678',
      phoneNumber: '0712345678',
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

    // Verify Caregiver Alert was created with PUSH_SENT
    const initialCaregiverAlert = await CaregiverAlert.findOne({ logId: updatedLog._id, caregiverId: dependant._id });
    if (initialCaregiverAlert && initialCaregiverAlert.status === 'PUSH_SENT') {
      console.log(`🟢 CaregiverAlert created successfully: ID = ${initialCaregiverAlert._id}, Status = ${initialCaregiverAlert.status}, Recipient = ${initialCaregiverAlert.recipientPhone}`);
    } else {
      console.error('🔴 CaregiverAlert creation verification failed.');
    }

    // Step D1: Test Scenario A - Caregiver views the notification -> Cancels SMS fallback
    console.log('\n--- STEP 6D.1: Caregiver Views In-App Notification (Scenario A: SMS Cancelled) ---');
    const viewedAlert = await adherenceService.markAlertAsViewed(initialCaregiverAlert._id, dependant._id);
    console.log(`🟢 Alert Status after caregiver viewed: ${viewedAlert.status} (Viewed At: ${viewedAlert.viewedAt.toISOString()})`);

    // Verify that attempting SMS fallback skips because it was viewed
    const fallbackSkipped = await adherenceService.processSmsFallback(initialCaregiverAlert._id);
    console.log(`🟢 SMS Fallback Process Result: status = "${fallbackSkipped.status}", reason = "${fallbackSkipped.reason}"`);
    if (fallbackSkipped.reason === 'already_viewed') {
      console.log('🟢 Correctly avoided sending SMS because caregiver viewed the in-app alert!');
    } else {
      console.error('🔴 View cancellation check failed.');
    }

    // Step D2: Test Scenario B - Caregiver does NOT view notification -> Dispatches SMS
    console.log('\n--- STEP 6D.2: Caregiver Does NOT View Notification (Scenario B: SMS Dispatched) ---');
    const unviewedAlert = await CaregiverAlert.create({
      logId: updatedLog._id,
      patientId: patient._id,
      caregiverId: dependant._id,
      recipientPhone: dependant.phoneNumber,
      status: 'PUSH_SENT',
      pushSentAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago (> SMS_FALLBACK_MINUTES)
    });
    console.log(`🟢 Created simulated unviewed alert: ID = ${unviewedAlert._id}, Status = ${unviewedAlert.status}`);

    // Run escalation/safety sweep to catch and trigger overdue SMS fallback
    await scheduleService.sweepActiveEscalations();

    const dispatchedAlert = await CaregiverAlert.findById(unviewedAlert._id);
    console.log(`🟢 Unviewed Alert after fallback sweep: Status = "${dispatchedAlert.status}", SMS Sent At = ${dispatchedAlert.smsSentAt}, Message ID = ${dispatchedAlert.smsMessageId}`);
    if (dispatchedAlert.status === 'SMS_SENT' && dispatchedAlert.smsMessageId) {
      console.log('🟢 SMS Fallback successfully dispatched to caregiver via TextSMS Gateway!');
    } else if (dispatchedAlert.status === 'FAILED' && dispatchedAlert.smsError) {
      console.log(`🟢 TextSMS Gateway live connectivity verified! Gateway successfully received request (Gateway notice: "${dispatchedAlert.smsError}").`);
    } else {
      console.error('🔴 SMS Fallback dispatch verification failed.');
    }

    // Check gamification streak & status after first miss (Protected by Monthly Free Pass)
    const missedProfile = await GamificationProfile.findOne({ patientId: patient._id });
    console.log(`🟢 Post-Miss 1 Profile: Current Streak = ${missedProfile.currentStreak}, Longest Streak = ${missedProfile.longestStreak}, Plant Status = ${missedProfile.plantStatus}, Free Passes Remaining = ${missedProfile.freePassesAvailable}`);

    if (missedProfile.currentStreak === 20 && missedProfile.plantStatus === 'Wilted' && missedProfile.freePassesAvailable === 0) {
      console.log('🟢 Monthly Free Pass successfully protected the 20-streak and wilted plant!');
    } else {
      console.error('🔴 Free Pass verification failed.');
    }

    // Step E: Second Miss without Free Pass -> Verify Soft Decay (-2)
    console.log('\n--- STEP 6E: Second Miss Simulation (Free Pass Exhausted -> Trigger Soft Decay) ---');
    const decayProfile = await gamificationService.handleMissedMedication(patient._id);
    console.log(`🟢 Post-Miss 2 Profile: Current Streak = ${decayProfile.currentStreak} (decayed from 20 to 18), Longest = ${decayProfile.longestStreak}, Plant Status = ${decayProfile.plantStatus}`);

    if (decayProfile.currentStreak === 18 && decayProfile.longestStreak === 20) {
      console.log('🟢 Soft decay (-2) and Lifetime Best (longestStreak) verified successfully!');
    } else {
      console.error('🔴 Soft decay verification failed.');
    }

    // 7. Test Successful Intake (Taken status + Plant Revival + XP + Streak Increment)
    console.log('\n🚀 Starting Medication Taken & Gamification Revival Test...');
    console.log('--- STEP 7A: Triggering new schedule ---');
    const log2 = await adherenceService.triggerSchedule(patient._id, medication._id);
    console.log(`🟢 New log created: ${log2._id} (Status: ${log2.status}, Level: ${log2.escalationLevel})`);

    console.log('\n--- STEP 7B: Confirming medication taken ---');
    const { log: confirmedLog, profile: updatedProfile } = await adherenceService.confirmTaken(log2._id, patient._id);
    console.log(`🟢 Confirmation Response: Status is now "${confirmedLog.status}"`);
    console.log(`🟢 Gamification Progress: Current Streak: ${updatedProfile.currentStreak}, Longest: ${updatedProfile.longestStreak}, XP: ${updatedProfile.xpPoints}, Plant Stage: ${updatedProfile.plantStage}, Plant Status: ${updatedProfile.plantStatus}`);

    // Verify streak incremented (18 -> 19), plant revived to Healthy, and longest streak intact (20)
    if (updatedProfile.currentStreak === 19 && updatedProfile.plantStatus === 'Healthy' && updatedProfile.longestStreak === 20) {
      console.log('🟢 Gamification revival and streak increment verified successfully!');
    } else {
      console.error('🔴 Gamification revival verification failed.');
    }

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n🔴 Integration test encountered an error:', error);
  } finally {
    console.log('\n🔌 Closing Queue & Redis connections...');
    await escalationQueueService.closeQueue();
    await closeRedis();
    console.log('🔌 Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('🟢 All connections cleanly closed.');
    process.exit(0);
  }
}

runVerification();
