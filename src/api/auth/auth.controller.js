const authService = require('./auth.service');

class AuthController {
  async register(req, res, next) {
    try {
      const { user, token } = await authService.register(req.body);
      res.status(201).json({
        status: 'success',
        token,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { username, pin } = req.body;
      const { user, token } = await authService.login(username, pin);
      res.status(200).json({
        status: 'success',
        token,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      // req.user is attached by protect middleware
      res.status(200).json({
        status: 'success',
        data: { user: req.user }
      });
    } catch (error) {
      next(error);
    }
  }

  async associate(req, res, next) {
    try {
      const { associateUsername } = req.body;
      const updatedUser = await authService.associateUser(req.user._id, associateUsername);
      res.status(200).json({
        status: 'success',
        data: { user: updatedUser }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
