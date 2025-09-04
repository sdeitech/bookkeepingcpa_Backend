const jwt = require('jsonwebtoken');
const secret_key = "GHJI!@$%^&**"

module.exports = {
  async issueJwtToken(payload) {
    return jwt.sign(payload, secret_key, { expiresIn: '7d' }); // 7 days expiration
  },
  async verifyJwtToken(token, cb) {
    return jwt.verify(token, secret_key, cb);
  }
}