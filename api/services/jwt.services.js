const jwt = require('jsonwebtoken');
const secret_key = "GHJI!@$%^&**"

module.exports = {
  async issueJwtToken(payload) {
    return jwt.sign(payload, secret_key, { expiresIn: '50h' }); // 50 H expiration
  },
  async verifyJwtToken(token, cb) {
    return jwt.verify(token, secret_key, cb);
  }
}