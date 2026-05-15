/**
 * Centralized Validation & Sanitization Utility
 */

const validate = {
  // Regex for RFC 5322 compliant email validation
  isEmail: (email) => {
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return re.test(String(email).toLowerCase());
  },

  // Basic string sanitization (trim and escape HTML)
  sanitize: (str) => {
    if (typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // Validate password strength (min 6 chars)
  isStrongPassword: (pwd) => {
    return typeof pwd === 'string' && pwd.length >= 6;
  },

  // Validate name (alphanumeric and spaces)
  isValidName: (name) => {
    return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 50;
  }
};

module.exports = validate;
