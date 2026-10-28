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
    longestStreak: {
      type: Number,
      default: 0,
      min: [0, 'Longest streak cannot be negative'],
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
    },
    plantStatus: {
      type: String,
      enum: {
        values: ['Healthy', 'Wilted'],
        message: 'Plant status must be Healthy or Wilted',
      },
      default: 'Healthy',
    },
    freePassesAvailable: {
      type: Number,
      default: 1,
      min: [0, 'Free passes cannot be negative'],
    },
    lastFreePassResetMonth: {
      type: String, // format "YYYY-MM"
      default: () => new Date().toISOString().slice(0, 7),
    }
  },
  {
    timestamps: true,
  }
);

const GamificationProfile = mongoose.model('GamificationProfile', gamificationProfileSchema);

module.exports = GamificationProfile;
