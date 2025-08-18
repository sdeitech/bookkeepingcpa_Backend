const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    first_name: { type: String },
    last_name: { type: String },
    profile: { type: String },
    folderId: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, },
    role_id: { type: String, required: true }, // 1=SuperAdmin, 2=Staff, 3=Client
    active: { type: Boolean, default: true },
    phoneNumber: { type: String, default: null },
    dob: { type: String },
    address: { type: String, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }, // For tracking who created staff members
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);