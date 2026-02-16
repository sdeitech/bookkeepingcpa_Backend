const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        unique: true,
        required: true
        // Examples: 'defaultStaffForNewClients', 'notificationSettings'
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
        // Can be any type: String, Number, Object, Array
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
        // Track who last updated this setting
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Settings', settingsSchema);