const mongoose = require('mongoose');

const assignClientSchema = new mongoose.Schema({
  staffId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  clientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',  // In Plurify, clients are also Users with role_id: 3
    required: true
  }
}, 
{ timestamps: true }
);

// Compound index to ensure unique staff-client pairs
assignClientSchema.index({ staffId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('AssignClient', assignClientSchema);