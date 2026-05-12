const { verifyToken } = require('../lib/auth');
const { unauthorized } = require('../lib/httpErrors');

function authJwt(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token) return unauthorized(res);
    try {
      const payload = verifyToken(token, secret);
      req.user = { id: payload.sub, email: payload.email };
      next();
    } catch {
      return unauthorized(res, 'Invalid or expired token');
    }
  };
}

module.exports = { authJwt };
