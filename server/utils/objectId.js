const { Types } = require('mongoose');

/**
 * Returns true if `id` is a valid MongoDB ObjectId string.
 */
function isValidObjectId(id) {
  return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === String(id);
}

/**
 * Safely casts a string to ObjectId.
 * Returns the ObjectId if valid, or the original value (for non-ObjectId string IDs like 'demo-user-id').
 */
function toObjectId(id) {
  return isValidObjectId(id) ? new Types.ObjectId(id) : id;
}

/**
 * Express middleware: validates req.params.id as ObjectId.
 * Sends 400 if invalid — prevents crash in findById calls.
 */
function requireValidObjectId(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (id && !isValidObjectId(id)) {
      return res.status(400).json({ error: `Invalid ID format: ${paramName}` });
    }
    next();
  };
}

module.exports = { isValidObjectId, toObjectId, requireValidObjectId };
