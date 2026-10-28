const GamificationProfile = require('./gamification.model');

class GamificationService {
  /**
   * Helper to ensure monthly reset of the 1 free pass
   * @param {Object} profile
   * @returns {boolean} whether profile was updated
   */
  _refreshMonthlyFreePass(profile) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (profile.lastFreePassResetMonth !== currentMonth) {
      profile.freePassesAvailable = 1;
      profile.lastFreePassResetMonth = currentMonth;
      return true;
    }
    return false;
  }

  /**
   * Get patient profile
   * @param {string} patientId
   */
  async getProfile(patientId) {
    let profile = await GamificationProfile.findOne({ patientId });
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (!profile) {
      profile = await GamificationProfile.create({
        patientId,
        currentStreak: 0,
        longestStreak: 0,
        xpPoints: 0,
        plantStage: 'Seed',
        plantStatus: 'Healthy',
        freePassesAvailable: 1,
        lastFreePassResetMonth: currentMonth,
      });
    } else {
      if (this._refreshMonthlyFreePass(profile)) {
        await profile.save();
      }
    }
    return profile;
  }

  /**
   * Award XP and increment streak on successful medication intake
   * @param {string} patientId
   */
  async awardMedicationTaken(patientId) {
    const profile = await this.getProfile(patientId);

    // Increment current streak
    profile.currentStreak += 1;

    // Track lifetime best streak
    if (profile.currentStreak > (profile.longestStreak || 0)) {
      profile.longestStreak = profile.currentStreak;
    }

    // Revive plant status to Healthy on intake
    const wasWilted = profile.plantStatus === 'Wilted';
    profile.plantStatus = 'Healthy';

    // Calculate XP: Base + Streak Bonus
    const baseXP = 20;
    const streakBonus = Math.min(profile.currentStreak * 2, 30); // Up to +30 bonus XP
    const earnedXP = baseXP + streakBonus;
    profile.xpPoints += earnedXP;

    // Determine plant stage evolution based on XP
    const prevStage = profile.plantStage;
    if (profile.xpPoints < 50) {
      profile.plantStage = 'Seed';
    } else if (profile.xpPoints < 150) {
      profile.plantStage = 'Sprout';
    } else if (profile.xpPoints < 300) {
      profile.plantStage = 'Bud';
    } else if (profile.xpPoints < 500) {
      profile.plantStage = 'Flowering';
    } else {
      profile.plantStage = 'Mature';
    }

    await profile.save();

    console.log(`✨ [Gamification] Patient ${patientId} took medication!`);
    console.log(`   Earned: +${earnedXP} XP (Base: ${baseXP}, Bonus: ${streakBonus})`);
    console.log(`   Current Streak: ${profile.currentStreak} | Lifetime Best: ${profile.longestStreak}`);
    console.log(`   Total XP: ${profile.xpPoints} | Plant: ${profile.plantStage} (${profile.plantStatus})`);
    if (wasWilted) {
      console.log(`   💧 Plant hydrated and revived back to Healthy!`);
    }
    if (prevStage !== profile.plantStage) {
      console.log(`   🌱 PLANT EVOLVED! Old Stage: ${prevStage} ➔ New Stage: ${profile.plantStage}`);
    }

    return profile;
  }

  /**
   * Handle missed medication:
   * 1. Wilts the plant (plantStatus = 'Wilted').
   * 2. Uses monthly Free Pass if available (protects current streak).
   * 3. If no Free Pass, applies Soft Decay (currentStreak = max(0, currentStreak - 2)).
   * 4. Lifetime best (longestStreak) remains permanently intact.
   * @param {string} patientId
   */
  async handleMissedMedication(patientId) {
    const profile = await this.getProfile(patientId);

    // Plant status changes to Wilted
    profile.plantStatus = 'Wilted';

    // Check monthly free pass
    this._refreshMonthlyFreePass(profile);

    if (profile.freePassesAvailable > 0) {
      profile.freePassesAvailable -= 1;
      console.log(`🛡️ [Gamification] Monthly Free Pass applied for patient ${patientId}! Streak protected at ${profile.currentStreak}. Passes remaining: ${profile.freePassesAvailable}`);
    } else {
      // Soft decay: drop by -2 instead of dropping to 0
      const prevStreak = profile.currentStreak;
      profile.currentStreak = Math.max(0, profile.currentStreak - 2);
      console.log(`🥀 [Gamification] Streak soft decay applied for patient ${patientId}: ${prevStreak} ➔ ${profile.currentStreak} (-2).`);
    }

    await profile.save();
    return profile;
  }
}

module.exports = new GamificationService();
