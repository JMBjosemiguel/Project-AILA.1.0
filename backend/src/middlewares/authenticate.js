const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAuthToken } = require('../utils/jwt');
const { findActiveSessionById } = require('../models/sessionModel');
const { findUserById } = require('../models/userModel');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

const authenticate = asyncHandler(async (req, res, next) => {
  void res;
  const token = getBearerToken(req);

  if (!token) {
    throw new ApiError(401, 'Authentication token is required.');
  }

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired authentication token.');
  }

  const session = await findActiveSessionById(payload.sessionId, payload.sub);
  if (!session) {
    throw new ApiError(401, 'Session is no longer active.');
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    throw new ApiError(401, 'User account is no longer available.');
  }

  req.auth = {
    user,
    session,
    token,
  };

  next();
});

module.exports = {
  authenticate,
};
