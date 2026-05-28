const mongoose = require('mongoose');

const communityPostSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Post must have an author'],
    },
    content: {
      type: String,
      required: [true, 'Post content cannot be empty'],
      trim: true,
      maxlength: [500, 'Post content cannot exceed 500 characters'],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    }
  },
  {
    timestamps: true,
  }
);

const CommunityPost = mongoose.model('CommunityPost', communityPostSchema);

module.exports = CommunityPost;
