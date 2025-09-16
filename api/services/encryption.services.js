const CryptoJS = require('crypto-js');

class EncryptionService {
  constructor() {
    this.key = process.env.ENCRYPTION_KEY;
    if (!this.key || this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
    }
  }

  /**
   * Encrypt a text string
   * @param {string} text - Plain text to encrypt
   * @returns {string} - Encrypted text
   */
  encrypt(text) {
    if (!text) return null;
    try {
      return CryptoJS.AES.encrypt(text, this.key).toString();
    } catch (error) {
      console.error('Encryption failed:', error.message);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt an encrypted text string
   * @param {string} encryptedText - Encrypted text to decrypt
   * @returns {string} - Decrypted plain text
   */
  decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.key);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted) {
        throw new Error('Decryption resulted in empty string');
      }
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error.message);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt an object
   * @param {Object} obj - Object to encrypt
   * @returns {string} - Encrypted object as string
   */
  encryptObject(obj) {
    try {
      const jsonString = JSON.stringify(obj);
      return this.encrypt(jsonString);
    } catch (error) {
      console.error('Object encryption failed:', error.message);
      throw new Error('Failed to encrypt object');
    }
  }

  /**
   * Decrypt to an object
   * @param {string} encryptedText - Encrypted text to decrypt
   * @returns {Object} - Decrypted object
   */
  decryptObject(encryptedText) {
    try {
      const decryptedString = this.decrypt(encryptedText);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Object decryption failed:', error.message);
      throw new Error('Failed to decrypt object');
    }
  }

  /**
   * Generate a hash of the text (for comparison, not reversible)
   * @param {string} text - Text to hash
   * @returns {string} - Hash of the text
   */
  hash(text) {
    return CryptoJS.SHA256(text).toString();
  }
}

// Export singleton instance
module.exports = new EncryptionService();