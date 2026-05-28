const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Please provide a username'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: {
        values: ['Patient', 'Caregiver', 'Dependant'],
        message: 'Role must be either Patient, Caregiver, or Dependant',
      },
      default: 'Patient',
    },
    contactInfo: {
      type: String,
      required: [true, 'Please provide contact info (email or phone)'],
      trim: true,
    },
    pinHash: {
      type: String,
      required: [true, 'Please provide a security PIN / password'],
      minlength: [4, 'PIN must be at least 4 characters long'],
    },
    associatedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      }
    ]
  },
  {
    timestamps: true,
  }
);

// Encrypt the PIN before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('pinHash')) return next();
  this.pinHash = await bcrypt.hash(this.pinHash, 10);
  next();
});

// Instance method to check PIN correctness
userSchema.methods.comparePIN = async function (candidatePIN) {
  return await bcrypt.compare(candidatePIN, this.pinHash);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
