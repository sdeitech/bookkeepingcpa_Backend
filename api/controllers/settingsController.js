const Settings = require('../models/settingsModel');

// GET SETTING
exports.getSetting = async (req, res) => {
  try {
    const { key } = req.params;
    
    const setting = await Settings.findOne({ key });
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: setting
    });
    
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch setting',
      error: error.message
    });
  }
};

// UPDATE SETTING
exports.updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const user = req.user;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Value is required'
      });
    }
    
    // Upsert (update or insert)
    const setting = await Settings.findOneAndUpdate(
      { key },
      {
        key,
        value,
        updatedBy: user._id,
        updatedAt: new Date()
      },
      {
        new: true,
        upsert: true
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Setting updated successfully',
      data: setting
    });
    
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update setting',
      error: error.message
    });
  }
};