const bcrypt = require('bcrypt');

module.exports = {
    async generatePassword(password) {
        const salt = bcrypt.genSaltSync();
        const hash = bcrypt.hashSync(password, salt);
        return hash;
    },
    async comparePassword(pw, hash) {
        return bcrypt.compareSync(pw, hash)
    }
}