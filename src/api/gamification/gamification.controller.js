const gamificationService = require('./gamification.service');

class GamificationController {
  async getProfile(req, res, next) {
    try {
      const patientId = req.user.role === 'Patient' ? req.user._id : req.query.patientId;
      if (!patientId) {
        return res.status(400).json({
          status: 'fail',
          message: 'Please provide patientId as a query parameter'
        });
      }

      const profile = await gamificationService.getProfile(patientId);
      res.status(200).json({
        status: 'success',
        data: { profile }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new GamificationController();
