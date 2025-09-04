const Onboarding = require('../models/onboarding.model');
const User = require('../models/userModel');

// Get onboarding status for the current user
const getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    
    const onboarding = await Onboarding.findOne({ userId });
    
    if (!onboarding) {
      return res.status(200).json({
        exists: false,
        completed: false,
        currentStep: 1,
        message: 'No onboarding record found'
      });
    }
    
    return res.status(200).json({
      exists: true,
      completed: onboarding.completed,
      currentStep: onboarding.currentStep,
      completedAt: onboarding.completedAt,
      completionPercentage: onboarding.getCompletionPercentage()
    });
  } catch (error) {
    console.error('Error getting onboarding status:', error);
    return res.status(500).json({
      error: 'Failed to get onboarding status',
      message: error.message
    });
  }
};

// Get saved onboarding data
const getOnboardingData = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    
    const onboarding = await Onboarding.findOne({ userId });
    
    if (!onboarding) {
      // Create a new onboarding record if it doesn't exist
      const newOnboarding = new Onboarding({
        userId,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          source: 'web'
        }
      });
      
      await newOnboarding.save();
      
      return res.status(200).json({
        currentStep: 1,
        completed: false,
        data: {
          businessNeeds: null,
          previousBookkeeper: null,
          businessDetails: {
            businessName: '',
            businessType: '',
            yearStarted: '',
            employeeCount: '',
            monthlyRevenue: ''
          },
          industry: null
        }
      });
    }
    
    return res.status(200).json({
      currentStep: onboarding.currentStep,
      completed: onboarding.completed,
      data: onboarding.data,
      lastSavedAt: onboarding.metadata.lastSavedAt,
      completionPercentage: onboarding.getCompletionPercentage()
    });
  } catch (error) {
    console.error('Error getting onboarding data:', error);
    return res.status(500).json({
      error: 'Failed to get onboarding data',
      message: error.message
    });
  }
};

// Save onboarding progress
const saveOnboardingProgress = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { currentStep, data } = req.body;
    
    // Validate input
    if (!currentStep || !data) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'currentStep and data are required'
      });
    }
    
    // Find or create onboarding record
    let onboarding = await Onboarding.findOne({ userId });
    
    if (!onboarding) {
      onboarding = new Onboarding({
        userId,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          source: 'web'
        }
      });
    }
    
    // Update onboarding data
    onboarding.currentStep = currentStep;
    
    // Merge the new data with existing data
    if (data.businessNeeds !== undefined) {
      onboarding.data.businessNeeds = data.businessNeeds;
    }
    if (data.previousBookkeeper !== undefined) {
      onboarding.data.previousBookkeeper = data.previousBookkeeper;
    }
    if (data.businessDetails) {
      onboarding.data.businessDetails = {
        ...onboarding.data.businessDetails,
        ...data.businessDetails
      };
    }
    if (data.industry !== undefined) {
      onboarding.data.industry = data.industry;
    }
    
    // Update metadata
    onboarding.metadata.ipAddress = req.ip;
    onboarding.metadata.userAgent = req.get('user-agent');
    
    await onboarding.save();
    
    return res.status(200).json({
      success: true,
      message: 'Progress saved successfully',
      currentStep: onboarding.currentStep,
      completed: onboarding.completed,
      completionPercentage: onboarding.getCompletionPercentage()
    });
  } catch (error) {
    console.error('Error saving onboarding progress:', error);
    return res.status(500).json({
      error: 'Failed to save progress',
      message: error.message
    });
  }
};

// Complete onboarding
const completeOnboarding = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { data } = req.body;
    
    // Find onboarding record
    let onboarding = await Onboarding.findOne({ userId });
    
    if (!onboarding) {
      return res.status(404).json({
        error: 'Onboarding record not found',
        message: 'Please start the onboarding process first'
      });
    }
    
    // Update with final data if provided
    if (data) {
      if (data.businessNeeds !== undefined) {
        onboarding.data.businessNeeds = data.businessNeeds;
      }
      if (data.previousBookkeeper !== undefined) {
        onboarding.data.previousBookkeeper = data.previousBookkeeper;
      }
      if (data.businessDetails) {
        onboarding.data.businessDetails = {
          ...onboarding.data.businessDetails,
          ...data.businessDetails
        };
      }
      if (data.industry !== undefined) {
        onboarding.data.industry = data.industry;
      }
    }
    
    // Validate all required fields are completed
    const errors = [];
    
    if (!onboarding.data.businessNeeds) {
      errors.push('Business needs selection is required');
    }
    if (!onboarding.data.previousBookkeeper) {
      errors.push('Previous bookkeeper information is required');
    }
    if (!onboarding.data.businessDetails.businessName) {
      errors.push('Business name is required');
    }
    if (!onboarding.data.businessDetails.businessType) {
      errors.push('Business type is required');
    }
    if (!onboarding.data.industry) {
      errors.push('Industry selection is required');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Incomplete onboarding',
        message: 'Please complete all required fields',
        errors
      });
    }
    
    // Mark as completed
    onboarding.completed = true;
    onboarding.completedAt = new Date();
    onboarding.currentStep = 4; // Final step
    
    await onboarding.save();
    
    // Update user record to indicate onboarding is complete
    await User.findByIdAndUpdate(userId, {
      onboardingCompleted: true,
      onboardingCompletedAt: new Date()
    });
    
    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      completed: true,
      completedAt: onboarding.completedAt,
      data: onboarding.data
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return res.status(500).json({
      error: 'Failed to complete onboarding',
      message: error.message
    });
  }
};

// Validate onboarding step
const validateOnboardingStep = async (req, res) => {
  try {
    const { step } = req.params;
    const { data } = req.body;
    
    const stepNumber = parseInt(step);
    const errors = [];
    
    switch (stepNumber) {
      case 1:
        // Validate business needs
        if (!data || !data.businessNeeds) {
          errors.push('Please select your business needs');
        }
        break;
        
      case 2:
        // Validate bookkeeper history
        if (!data || !data.previousBookkeeper) {
          errors.push('Please indicate if you had a previous bookkeeper');
        }
        break;
        
      case 3:
        // Validate business details
        if (!data || !data.businessDetails) {
          errors.push('Business details are required');
        } else {
          if (!data.businessDetails.businessName) {
            errors.push('Business name is required');
          }
          if (!data.businessDetails.businessType) {
            errors.push('Business type is required');
          }
          if (!data.businessDetails.yearStarted) {
            errors.push('Year started is required');
          }
          if (!data.businessDetails.employeeCount) {
            errors.push('Employee count is required');
          }
          if (!data.businessDetails.monthlyRevenue) {
            errors.push('Monthly revenue range is required');
          }
        }
        break;
        
      case 4:
        // Validate industry
        if (!data || !data.industry) {
          errors.push('Please select your industry');
        }
        break;
        
      default:
        errors.push('Invalid step number');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        valid: false,
        errors,
        message: errors[0]
      });
    }
    
    return res.status(200).json({
      valid: true,
      message: 'Step validated successfully'
    });
  } catch (error) {
    console.error('Error validating step:', error);
    return res.status(500).json({
      error: 'Failed to validate step',
      message: error.message
    });
  }
};

// Delete onboarding data (for testing/admin purposes)
const deleteOnboardingData = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    
    await Onboarding.findOneAndDelete({ userId });
    
    // Also update user record
    await User.findByIdAndUpdate(userId, {
      onboardingCompleted: false,
      onboardingCompletedAt: null
    });
    
    return res.status(200).json({
      success: true,
      message: 'Onboarding data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting onboarding data:', error);
    return res.status(500).json({
      error: 'Failed to delete onboarding data',
      message: error.message
    });
  }
};

module.exports = {
  getOnboardingStatus,
  getOnboardingData,
  saveOnboardingProgress,
  completeOnboarding,
  validateOnboardingStep,
  deleteOnboardingData
};