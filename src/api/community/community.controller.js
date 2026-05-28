const communityService = require('./community.service');

class CommunityController {
  async create(req, res, next) {
    try {
      const post = await communityService.createPost({
        authorId: req.user._id,
        content: req.body.content
      });

      res.status(201).json({
        status: 'success',
        data: { post }
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const posts = await communityService.getPosts();
      res.status(200).json({
        status: 'success',
        results: posts.length,
        data: { posts }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CommunityController();
