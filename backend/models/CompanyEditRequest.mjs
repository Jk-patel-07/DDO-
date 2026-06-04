import mongoose from 'mongoose';

const companyAssetSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    size: { type: Number, default: 0 },
    dataUrl: { type: String, default: '' },
  },
  { _id: false },
);

const companyEditDetailsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: '', trim: true },
    companyWebsite: { type: String, default: '', trim: true },
    companyDetails: { type: String, default: '', trim: true },
    companyEmail: { type: String, default: '', trim: true, lowercase: true },
    companyPhone: { type: String, default: '', trim: true },
    companyAddress: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    fillerName: { type: String, default: '', trim: true },
    fillerEmail: { type: String, default: '', trim: true, lowercase: true },
    fillerPhone: { type: String, default: '', trim: true },
    companyPosition: { type: String, default: '', trim: true },
    companyLogo: { type: companyAssetSchema, default: null },
    companyPhoto: { type: companyAssetSchema, default: null },
    companyRegisteredProof: { type: companyAssetSchema, default: null },
  },
  { _id: false },
);

const companyEditRequestSchema = new mongoose.Schema(
  {
    companyObjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    companyId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    companyEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      index: true,
    },
    adminEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      default: 'pending',
      trim: true,
      index: true,
    },
    decisionTokenHash: {
      type: String,
      required: true,
      index: true,
    },
    beforeDetails: {
      type: companyEditDetailsSchema,
      required: true,
    },
    afterDetails: {
      type: companyEditDetailsSchema,
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    decisionBy: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
    collection: 'company_edit_requests',
  },
);

const CompanyEditRequest = mongoose.models.CompanyEditRequest
  || mongoose.model('CompanyEditRequest', companyEditRequestSchema);

export default CompanyEditRequest;
