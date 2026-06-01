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
    companyAddress: {
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
    employees: {
      type: [
        new mongoose.Schema(
          {
            name: { type: String, default: '', trim: true },
            email: { type: String, default: '', trim: true, lowercase: true },
            role: { type: String, default: '', trim: true },
            status: { type: String, default: 'Active', trim: true },
            joinedDate: { type: Date, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    loginActivity: {
      type: [
        new mongoose.Schema(
          {
            time: { type: Date, default: Date.now },
            action: { type: String, default: 'Login', trim: true },
            source: { type: String, default: 'DDO App', trim: true },
            status: { type: String, default: 'Success', trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    submittedForms: {
      type: [
        new mongoose.Schema(
          {
            title: { type: String, default: '', trim: true },
            status: { type: String, default: 'Submitted', trim: true },
            submittedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'companies' },
);

const Company = mongoose.models.Company || mongoose.model('Company', companySchema);

export default Company;
