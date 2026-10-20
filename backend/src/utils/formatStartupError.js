// A refused/unreachable TCP connection to a host that resolves to more than
// one address (e.g. 'localhost' -> ::1 and 127.0.0.1) makes Node's connector
// throw an AggregateError once every candidate has failed. AggregateError's
// own .message is empty by default, which is why startup failures used to
// print "Unable to start backend:" with nothing after it — the real code and
// message were sitting unseen inside error.errors[0].
function formatStartupError(error, { host, port } = {}) {
  const inner = (error && Array.isArray(error.errors) && error.errors[0]) || error;
  const code = (inner && inner.code) || (error && error.code) || 'UNKNOWN_ERROR';
  const message = (inner && inner.message) || (error && error.message) || String(error);
  const target = host !== undefined || port !== undefined ? ` (target=${host || 'localhost'}:${port || 3306})` : '';
  return `${code}: ${message}${target}`;
}

module.exports = { formatStartupError };
