const { ZodError } = require('zod');

function validationError(err, res) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
  }
  return null;
}

function notFound(res, message = 'Not found') {
  return res.status(404).json({ error: message });
}

function forbidden(res, message = 'Forbidden') {
  return res.status(403).json({ error: message });
}

function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({ error: message });
}

function serverError(res, err, log) {
  if (log) console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = {
  validationError,
  notFound,
  forbidden,
  unauthorized,
  serverError,
};
