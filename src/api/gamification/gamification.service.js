const GamificationProfile = require('./gamification.model');

class GamificationService {
  /**
   * Get patient profile
   * @param {string} patientId
   */
  async getProfile(patientId) {
    let profile = await GamificationProfile.findOne({ patientId });
    if (!profile) {
      profile = await GamificationProfile.create({
        patientId,
        currentStreak: 0,
        xpPoints: 0,
        plantStage: 'Seed',
      });
    }
    return profile;
  }

  /**
   * Award XP and increment streak on successful medication intake
   * @param {string} patientId
   */
  async awardMedicationTaken(patientId) {
    const profile = await this.getProfile(patientId);

    // Increment streak
    profile.currentStreak += 1;

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
    console.log(`   New Streak: ${profile.currentStreak}`);
    console.log(`   Total XP: ${profile.xpPoints}`);
    if (prevStage !== profile.plantStage) {
      console.log(`   🌱 PLANT EVOLVED! Old Stage: ${prevStage} ➔ New Stage: ${profile.plantStage}`);
    }

    return profile;
  }

  /**
   * Reset streak if medication is missed
   * @param {string} patientId
   */
  async handleMissedMedication(patientId) {
    const profile = await this.getProfile(patientId);
    
    if (profile.currentStreak > 0) {
      console.log(`❌ [Gamification] Streak reset to 0 for patient ${patientId} due to missed dose.`);
      profile.currentStreak = 0;
      await profile.save();
    }
    
    return profile;
  }
}

module.exports = new GamificationService();
