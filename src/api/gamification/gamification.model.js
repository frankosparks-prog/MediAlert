const mongoose = require('mongoose');

const gamificationProfileSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Gamification profile must belong to a patient'],
      unique: true,
    },
    currentStreak: {
      type: Number,
      default: 0,
      min: [0, 'Streak cannot be negative'],
    },
    xpPoints: {
      type: Number,
      default: 0,
      min: [0, 'XP points cannot be negative'],
    },
    plantStage: {
      type: String,
      enum: {
        values: ['Seed', 'Sprout', 'Bud', 'Flowering', 'Mature'],
        message: 'Plant stage must be Seed, Sprout, Bud, Flowering, or Mature',
      },
      default: 'Seed',
    }
  },
  {
    timestamps: true,
  }
);

const GamificationProfile = mongoose.model('GamificationProfile', gamificationProfileSchema);

module.exports = GamificationProfile;
