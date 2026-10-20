// Spawned as a child process by uncaughtExceptionRestart.test.js — requiring
// server.js (without running it as main) installs the process handlers
// without binding a port or needing a real DB, then this deliberately throws
// outside any promise/callback Express could catch, to prove the real
// process.on('uncaughtException', ...) handler in server.js fires.
require('../../../src/server');

setImmediate(() => {
  throw new Error('deliberate test crash for uncaughtExceptionRestart.test.js');
});
