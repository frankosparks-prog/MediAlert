/**
 * NotificationService
 * Stub for sending push notifications via APNs and Firebase Cloud Messaging (FCM).
 * Real implementations would use 'firebase-admin' or 'apn' modules.
 */
class NotificationService {
  /**
   * Level 1 Alert: Standard Push + Soft Haptics
   * @param {Object} patient - Mongoose User document
   * @param {Object} medication - Mongoose Medication document
   */
  async sendLevel1Alert(patient, medication) {
    console.log(`\n🔔 [Notification Service] - LEVEL 1 ALERT SENT`);
    console.log(`   Target User: ${patient.username} (${patient.contactInfo})`);
    console.log(`   Medication: ${medication.drugName} - ${medication.dosage}`);
    console.log(`   FCM/APNs Payload:`);
    console.log(JSON.stringify({
      to: `/topics/user_${patient._id}`,
      notification: {
        title: "Medication Reminder",
        body: `It is time to take your ${medication.drugName} (${medication.dosage}).`,
        sound: "default"
      },
      data: {
        type: "reminder",
        level: "1",
        hapticPattern: "light-soft", // Soft haptic configuration
        interactiveAction: "CONFIRM_MEDICATION"
      }
    }, null, 2));
    return true;
  }

  /**
   * Level 2 Alert: High-Priority Push + Continuous Haptics
   * @param {Object} patient - Mongoose User document
   * @param {Object} medication - Mongoose Medication document
   */
  async sendLevel2Alert(patient, medication) {
    console.log(`\n🔔🔔 [Notification Service] - LEVEL 2 ALERT SENT`);
    console.log(`   Target User: ${patient.username} (${patient.contactInfo})`);
    console.log(`   Medication: ${medication.drugName} - ${medication.dosage}`);
    console.log(`   FCM/APNs Payload:`);
    console.log(JSON.stringify({
      to: `/topics/user_${patient._id}`,
      priority: "high", // High-priority delivery
      notification: {
        title: "⚠️ High Priority: Medication Overdue",
        body: `You are 15 minutes late taking your ${medication.drugName}. Please take it now.`,
        sound: "alert_continuous.caf"
      },
      data: {
        type: "reminder",
        level: "2",
        hapticPattern: "continuous-strong", // Strong continuous haptic pattern
        interactiveAction: "CONFIRM_MEDICATION"
      }
    }, null, 2));
    return true;
  }

  /**
   * Level 3 Alert: Critical Alert Payload (bypassing silent mode)
   * @param {Object} patient - Mongoose User document
   * @param {Object} medication - Mongoose Medication document
   */
  async sendLevel3Alert(patient, medication) {
    console.log(`\n🔔🔔🔔 [Notification Service] - LEVEL 3 ALERT SENT (CRITICAL)`);
    console.log(`   Target User: ${patient.username} (${patient.contactInfo})`);
    console.log(`   Medication: ${medication.drugName} - ${medication.dosage}`);
    console.log(`   FCM/APNs Payload:`);
    console.log(JSON.stringify({
      to: `/topics/user_${patient._id}`,
      aps: {
        alert: {
          title: "🚨 URGENT: Medication Critical Alert",
          body: `CRITICAL REMINDER: Take your ${medication.drugName} immediately.`
        },
        sound: {
          critical: 1, // Bypass silent switch/DND
          name: "critical_alarm.wav",
          volume: 1.0 // Maximum volume
        }
      },
      data: {
        type: "reminder",
        level: "3",
        hapticPattern: "alarm-looping",
        interactiveAction: "CONFIRM_MEDICATION"
      }
    }, null, 2));
    return true;
  }

  /**
   * Dependant/Caregiver Alert: Escalation notification
   * @param {Object} contactUser - The designated caregiver/dependant Mongoose User document
   * @param {Object} patient - Mongoose Patient User document
   * @param {Object} medication - Mongoose Medication document
   */
  async sendDependantAlert(contactUser, patient, medication) {
    console.log(`\n🚨🚨🚨 [Notification Service] - DEPENDANT / CAREGIVER ALERT SENT`);
    console.log(`   Escalating to: ${contactUser.username} (${contactUser.contactInfo}) - Role: ${contactUser.role}`);
    console.log(`   Regarding Patient: ${patient.username} (role: Patient)`);
    console.log(`   Medication Missed: ${medication.drugName} - ${medication.dosage}`);
    console.log(`   FCM/APNs Payload:`);
    console.log(JSON.stringify({
      to: `/topics/user_${contactUser._id}`,
      priority: "high",
      notification: {
        title: `🚨 Alert: ${patient.username} missed their medication`,
        body: `${patient.username} has missed their scheduled dose of ${medication.drugName} (${medication.dosage}) after multiple reminders. Please check on them.`
      },
      data: {
        type: "escalation",
        patientId: patient._id.toString(),
        medicationName: medication.drugName
      }
    }, null, 2));
    return true;
  }
}

module.exports = new NotificationService();
