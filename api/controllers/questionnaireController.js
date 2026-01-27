const QuestionnaireResponse = require('../models/questionnaireResponse.model');

/**
 * Plan recommendation logic (same as frontend)
 * @param {Object} answers - Questionnaire answers
 * @returns {String} Recommended plan: 'startup' | 'essential' | 'enterprise'
 */
const recommendPlan = (answers) => {
  const { q1Revenue, q2Support, q3Customization } = answers;

  // Priority 1: Enterprise
  // E1: High Revenue OR E2: High Customization OR E3: High Strategy
  if (q1Revenue === 'R3' || q3Customization === 'C2' || q2Support === 'S3') {
    return 'enterprise';
  }

  // Priority 2: Essential
  // L1: Medium Revenue OR L2: Medium Strategy
  if (q1Revenue === 'R2' || q2Support === 'S2') {
    return 'essential';
  }

  // Priority 3: Startup (Default)
  // D1: Low Revenue AND Low Strategy AND No Customization
  return 'startup';
};

/**
 * Validate questionnaire answers
 * @param {Object} answers - Questionnaire answers
 * @returns {Object} { valid: boolean, errors: Array }
 */
const validateAnswers = (answers) => {
  const errors = [];
  
  if (!answers) {
    return { valid: false, errors: ['Answers object is required'] };
  }

  // Validate Q1: Revenue
  if (answers.q1Revenue && !['R1', 'R2', 'R3'].includes(answers.q1Revenue)) {
    errors.push('Invalid value for q1Revenue');
  }

  // Validate Q2: Support
  if (answers.q2Support && !['S1', 'S2', 'S3'].includes(answers.q2Support)) {
    errors.push('Invalid value for q2Support');
  }

  // Validate Q3: Customization
  if (answers.q3Customization && !['C1', 'C2'].includes(answers.q3Customization)) {
    errors.push('Invalid value for q3Customization');
  }

  // Validate Q4: Structure
  if (answers.q4Structure && !['single-llc', 'partnership', 's-corp', 'c-corp'].includes(answers.q4Structure)) {
    errors.push('Invalid value for q4Structure');
  }

  // Validate Q5: Cleanup
  if (answers.q5Cleanup && !['T1', 'T2', 'T3'].includes(answers.q5Cleanup)) {
    errors.push('Invalid value for q5Cleanup');
  }

  // Validate Q6: Tax
  if (answers.q6Tax && !['X1', 'X2', 'X3'].includes(answers.q6Tax)) {
    errors.push('Invalid value for q6Tax');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Submit questionnaire response
 * POST /api/questionnaire/submit
 * 
 * Body:
 * - email: String (required)
 * - name: String (required)
 * - answers: Object (required)
 *   - q1Revenue: String (R1, R2, R3)
 *   - q2Support: String (S1, S2, S3)
 *   - q3Customization: String (C1, C2)
 *   - q4Structure: String (single-llc, partnership, s-corp, c-corp)
 *   - q5Cleanup: String (T1, T2, T3)
 *   - q6Tax: String (X1, X2, X3)
 */
const submitQuestionnaire = async (req, res) => {
  try {
    const { email, name, answers } = req.body;

    // Validate required fields
    if (!email || !name || !answers) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'email, name, and answers are required'
      });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Validate answers
    const validation = validateAnswers(answers);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid answers',
        message: 'One or more answer values are invalid',
        errors: validation.errors
      });
    }

    // Calculate recommended plan
    const recommendedPlan = recommendPlan(answers);

    // Create questionnaire response
    const questionnaireResponse = new QuestionnaireResponse({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      answers: {
        q1Revenue: answers.q1Revenue || null,
        q2Support: answers.q2Support || null,
        q3Customization: answers.q3Customization || null,
        q4Structure: answers.q4Structure || null,
        q5Cleanup: answers.q5Cleanup || null,
        q6Tax: answers.q6Tax || null
      },
      recommendedPlan,
      status: 'pending',
      metadata: {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || null,
        source: 'web'
      }
    });

    // Save to database
    await questionnaireResponse.save();

    // Return success response
    return res.status(201).json({
      success: true,
      message: 'Questionnaire submitted successfully',
      data: {
        id: questionnaireResponse._id,
        email: questionnaireResponse.email,
        recommendedPlan: questionnaireResponse.recommendedPlan,
        status: questionnaireResponse.status,
        submittedAt: questionnaireResponse.createdAt
      }
    });

  } catch (error) {
    console.error('Error submitting questionnaire:', error);

    // Handle duplicate email error (if unique index is enabled)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate submission',
        message: 'A questionnaire response with this email already exists'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        errors: Object.values(error.errors).map(e => e.message)
      });
    }

    // Generic error
    return res.status(500).json({
      success: false,
      error: 'Failed to submit questionnaire',
      message: error.message || 'An unexpected error occurred'
    });
  }
};

/**
 * Get questionnaire response by email
 * GET /api/questionnaire/:email
 * (Optional - for checking existing submissions)
 */
const getQuestionnaireByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const response = await QuestionnaireResponse.findOne({ 
      email: email.toLowerCase().trim() 
    }).sort({ createdAt: -1 }); // Get most recent

    if (!response) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'No questionnaire response found for this email'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: response._id,
        email: response.email,
        name: response.name,
        recommendedPlan: response.recommendedPlan,
        status: response.status,
        submittedAt: response.createdAt
      }
    });

  } catch (error) {
    console.error('Error getting questionnaire:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get questionnaire',
      message: error.message
    });
  }
};

module.exports = {
  submitQuestionnaire,
  getQuestionnaireByEmail,
  recommendPlan // Export for testing
};

