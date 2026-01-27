const Joi = require("joi");

const zapierPayloadSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  plan: Joi.string().valid("startup", "essential", "enterprise").required(),
  answers: Joi.object().optional(), // dynamic questionnaire data
});

module.exports = {
  zapierPayloadSchema,
};
