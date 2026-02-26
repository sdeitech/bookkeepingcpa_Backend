var joi = require("joi");

module.exports.completeInvite = joi.object({
  token: joi.string().required(),
  password: joi.string().min(6).required(),
  confirmPassword: joi.string().required(),
  first_name: joi.string().optional(),
  last_name: joi.string().optional()
});
