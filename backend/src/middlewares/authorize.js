const ApiError = require('../utils/ApiError');

function authorize(...allowedRoles) {
  return function roleAuthorization(req, res, next) {
    void res;
    const role = req.auth?.user?.role;

    if (!role || !allowedRoles.includes(role)) {
      return next(new ApiError(403, 'You are not allowed to access this resource.'));
    }

    return next();
  };
}

module.exports = {
  authorize,
};
