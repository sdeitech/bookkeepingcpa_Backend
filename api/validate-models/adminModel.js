var joi = require("joi");

module.exports.createStaff = joi.object({
  email: joi.string().email().required(),
  first_name: joi.string().required(),
  last_name: joi.string().required(),
  password: joi.string().min(6).required(),
  phoneNumber: joi.string().optional()
})

module.exports.updateStaff = joi.object({
  first_name: joi.string().optional(),
  last_name: joi.string().optional(),
  phoneNumber: joi.string().optional(),
  active: joi.boolean().optional()
})

module.exports.commonId = joi.object({
  id: joi.string().required()
})