var joi = require("joi");

module.exports.signinUser = joi.object({
  email: joi.string().email().required(),
  password: joi.string().required(),
})

module.exports.signupUser = joi.object({
  email: joi.string().email().required(),
  first_name: joi.string().required(),
  last_name: joi.string().required(),
  password: joi.string().required(),
  confirmPassword: joi.string().required(),
})

module.exports.commonId = joi.object({
  id: joi.string().required(),

})