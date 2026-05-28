const jwt = require('jsonwebtoken');
const User = require('./auth.model');
const GamificationProfile = require('../gamification/gamification.model');
const env = require('../../core/config/env');
const { AppError } = require('../../core/middleware/errorHandler');

class AuthService {
  /**
   * Helper to sign JWT token
   * @param {string} userId
   * @returns {string} token
   */
  signToken(userId) {
    return jwt.sign({ id: userId }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });
  }

  /**
   * Register a new user
   * @param {Object} userData
   */
  async register(userData) {
    const { username, role, contactInfo, pinHash, associatedUsers } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      throw new AppError('Username already taken', 400);
    }

    // Create user
    const newUser = await User.create({
      username,
      role,
      contactInfo,
      pinHash, // Will be encrypted in mongoose pre-save hook
      associatedUsers: associatedUsers || []
    });

    // Create a gamification profile if the user is a Patient or Dependant
    if (role === 'Patient' || role === 'Dependant') {
      await GamificationProfile.create({
        patientId: newUser._id,
        currentStreak: 0,
        xpPoints: 0,
        plantStage: 'Seed'
      });
    }

    // Clean sensitive data before returning
    newUser.pinHash = undefined;

    const token = this.signToken(newUser._id);
    return { user: newUser, token };
  }

  /**
   * Login user
   * @param {string} username
   * @param {string} pin
   */
  async login(username, pin) {
    if (!username || !pin) {
      throw new AppError('Please provide username and PIN', 400);
    }

    // Find user and explicitly select pinHash
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePIN(pin))) {
      throw new AppError('Incorrect username or PIN', 401);
    }

    // Clean PIN hash
    user.pinHash = undefined;

    const token = this.signToken(user._id);
    return { user, token };
  }

  /**
   * Associate user with another
   * @param {string} userId
   * @param {string} associateUsername
   */
  async associateUser(userId, associateUsername) {
    const user = await User.findById(userId);
    const associate = await User.findOne({ username: associateUsername });

    if (!user || !associate) {
      throw new AppError('User not found', 404);
    }

    if (user.associatedUsers.includes(associate._id)) {
      throw new AppError('User is already associated', 400);
    }

    user.associatedUsers.push(associate._id);
    await user.save();

    // Bidirectional link if desired, or let the user decide. Let's do bidirectional for ease of use.
    if (!associate.associatedUsers.includes(user._id)) {
      associate.associatedUsers.push(user._id);
      await associate.save();
    }

    return user;
  }
}

module.exports = new AuthService();
