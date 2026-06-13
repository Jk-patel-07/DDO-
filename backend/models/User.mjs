import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    middleName: {
      type: String,
      default: '',
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      default: '',
      trim: true,
    },
    moreInformation: {
      type: String,
      default: '',
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      default: 'local',
      trim: true,
    },
    accountStatus: {
      type: String,
      default: 'Active',
      trim: true,
    },
    role: {
      type: String,
      default: 'user',
      trim: true,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
