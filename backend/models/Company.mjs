import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    companyEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    companyPhone: {
      type: String,
      default: '',
      trim: true,
    },
    companyWebsite: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      default: 'pending',
      trim: true,
      index: true,
    },
    companyId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    companyKey: {
      type: String,
      default: '',
      trim: true,
    },
    companyPasswordHash: {
      type: String,
      default: '',
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, collection: 'companies' },
);

const Company = mongoose.models.Company || mongoose.model('Company', companySchema);

export default Company;
