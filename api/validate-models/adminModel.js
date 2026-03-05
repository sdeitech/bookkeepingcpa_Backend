var joi = require("joi");

module.exports.createStaff = joi.object({
  email: joi.string().email().required(),
  first_name: joi.string().required(),
  last_name: joi.string().required(),
  password: joi.string().min(6).required(),
  phoneNumber: joi.string().allow('', null).optional()
})

module.exports.inviteStaff = joi.object({
  email: joi.string().email().required(),
  first_name: joi.string().required(),
  last_name: joi.string().required(),
  phoneNumber: joi.string().allow('', null).optional()
})

module.exports.updateStaff = joi.object({
  first_name: joi.string().optional(),
  last_name: joi.string().optional(),
  phoneNumber: joi.string().allow('', null).optional(),
  active: joi.boolean().optional()
})

module.exports.commonId = joi.object({
  id: joi.string().required()
})

module.exports.assignClient = joi.object({
  clientId: joi.string().required(),
  staffId: joi.string().required(),
  notes: joi.string().optional().allow('').max(1000)
})

module.exports.unassignClient = joi.object({
  clientId: joi.string().required(),
  staffId: joi.string().required()
})
