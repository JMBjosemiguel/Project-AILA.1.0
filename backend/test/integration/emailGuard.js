'use strict';
/*
 * Integration tests must never send a real email.
 *
 * Most suites talk to the RUNNING dev backend over HTTP (register, resend,
 * forgot-password...), and that process picks its email driver from
 * backend/.env — the same file helpers.js loads. Forcing the variable inside
 * the test process alone could not stop that server from sending, so the
 * safe behavior is to refuse to run at all unless the driver is "console".
 */
function assertConsoleEmailDriver(env = process.env) {
  const driver = String(env.EMAIL_DRIVER || 'console').trim().toLowerCase();
  if (driver !== 'console') {
    throw new Error(
      `Refusing to run integration tests: EMAIL_DRIVER is "${driver}", not "console". ` +
      'Set EMAIL_DRIVER=console in backend/.env and restart the backend, so tests can never send real email.'
    );
  }
}

module.exports = { assertConsoleEmailDriver };
