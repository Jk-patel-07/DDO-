import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  provider: {
    type: String,
    default: 'stepfun',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const chatTabSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'New Chat',
    },
    provider: {
      type: String,
      default: 'stepfun',
    },
    messages: [chatMessageSchema],
  },
  {
    timestamps: true,
  },
);

const ChatTab = mongoose.models.ChatTab || mongoose.model('ChatTab', chatTabSchema);

export default ChatTab;
