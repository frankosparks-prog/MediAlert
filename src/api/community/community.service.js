const CommunityPost = require('./community.model');
const { AppError } = require('../../core/middleware/errorHandler');

class CommunityService {
  /**
   * Create a community support post
   * @param {Object} postData
   */
  async createPost(postData) {
    const { authorId, content } = postData;
    if (!content) {
      throw new AppError('Post content cannot be empty', 400);
    }

    const post = await CommunityPost.create({
      authorId,
      content,
    });

    return post;
  }

  /**
   * Retrieve all community posts
   */
  async getPosts() {
    return await CommunityPost.find()
      .populate('authorId', 'username role')
      .sort({ timestamp: -1 });
  }
}

module.exports = new CommunityService();
