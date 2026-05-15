const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const logFile = path.join(LOG_DIR, 'production.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Structured Logger for Production
 * Includes automated rotation and sensitive masking
 */
const logger = {
  log: (level, message, meta = {}) => {
    // Advanced Masking: Never log sensitive fields
    const mask = (obj) => {
      const clean = { ...obj };
      const secretKeys = ['password', 'token', 'secret', 'reset_token', 'tokenHash', 'trxnId'];
      for (const key of secretKeys) {
        if (clean[key]) clean[key] = '***MASKED***';
      }
      return clean;
    };

    const cleanMeta = mask(meta);

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...cleanMeta
    };

    const line = JSON.stringify(entry) + '\n';
    
    // Console logging
    if (level === 'ERROR' || level === 'SECURITY') {
      console.error(`[${level}] ${message}`, cleanMeta);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[${level}] ${message}`);
    }

    // Rotation & File Writing
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > MAX_LOG_SIZE) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          fs.renameSync(logFile, path.join(LOG_DIR, `production-${timestamp}.log`));
        }
      }
      fs.appendFileSync(logFile, line);
    } catch (e) {
      console.error('Logger failed to write or rotate:', e);
    }
  },

  info: (msg, meta) => logger.log('INFO', msg, meta),
  warn: (msg, meta) => logger.log('WARN', msg, meta),
  error: (msg, meta) => logger.log('ERROR', msg, meta),
  security: (msg, meta) => logger.log('SECURITY', msg, meta)
};

module.exports = logger;
