/**
 * Outbound email, abstracted behind EMAIL_DRIVER — mirrors the STORAGE_DRIVER
 * (local/r2) pattern already used for resource files. Nothing above this
 * module knows or cares which driver is active.
 *
 *   EMAIL_DRIVER=console (default)  — logs the email instead of sending it.
 *     Safe for local dev / CI: no SMTP credentials required, nothing leaves
 *     the machine. The full message is only logged outside production; in
 *     production a misconfigured console driver logs a masked summary only
 *     (never the raw verification link/token).
 *   EMAIL_DRIVER=smtp               — sends via nodemailer over generic SMTP
 *     (works with any provider — SendGrid, Mailgun, SES, a Gmail relay, ...).
 *     Provider-specific config lives ONLY in getSmtpConfig()/getTransport()
 *     below, entirely from environment variables. No credentials in code.
 */
const ApiError = require('../utils/ApiError');
const { appDateTimeStr, appTimeStr } = require('../utils/appTime');

let cachedTransport = null;

function getEmailDriver() {
  return (process.env.EMAIL_DRIVER || 'console').toLowerCase();
}

function getFromAddress() {
  return process.env.EMAIL_FROM || 'AILA <no-reply@aila.local>';
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1) || '*';
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

// A registration/resend request awaits this call synchronously (by design —
// see authService.js), so a slow or firewalled SMTP relay must fail FAST
// rather than hang: without an explicit timeout, nodemailer's own default
// (up to ~2 minutes for connectionTimeout) can stall the whole HTTP request
// long enough for an intermediate proxy or the browser to give up first —
// the exact "DB says created, UI says failed" bug this fixes. Configurable
// via SMTP_TIMEOUT_MS for environments with a known-slower relay.
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 10000);

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new ApiError(503, 'Email delivery is not configured. Please try again later.');
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
}

// Lazily required so `npm test` / the console driver never needs nodemailer
// installed-and-loaded on a machine that isn't sending real email.
function getTransport() {
  if (cachedTransport) return cachedTransport;
  const nodemailer = require('nodemailer');
  cachedTransport = nodemailer.createTransport(getSmtpConfig());
  return cachedTransport;
}

async function sendViaConsole({ to, subject, text }) {
  if (process.env.NODE_ENV === 'production') {
    // EMAIL_DRIVER=console in production is a misconfiguration, not a dev
    // convenience — never print the raw link/token in that case.
    console.log(`[emailService] (console driver, production) would send "${subject}" to ${maskEmail(to)}`);
    return { driver: 'console', to };
  }

  console.log(`\n[emailService] --- EMAIL (dev console driver) ---\nFrom: ${getFromAddress()}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n--- end email ---\n`);
  return { driver: 'console', to };
}

async function sendViaSmtp({ to, subject, html, text }) {
  const transport = getTransport();
  try {
    await transport.sendMail({ from: getFromAddress(), to, subject, html, text });
    return { driver: 'smtp', to };
  } catch (error) {
    console.error(`[emailService] smtp send failed for ${maskEmail(to)}: ${error.message}`);
    throw new ApiError(502, 'Could not send email right now. Please try again shortly.');
  }
}

async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || (!html && !text)) {
    throw new ApiError(500, 'Email is missing required fields.');
  }

  return getEmailDriver() === 'smtp'
    ? sendViaSmtp({ to, subject, html, text })
    : sendViaConsole({ to, subject, html, text });
}

// A register retry or Resend issues a brand-new link to the same address
// with an otherwise-identical subject — Gmail (and most clients) then groups
// them into one thread, burying the newest link under an older, now-
// superseded one. Including the send time in both the subject and the body
// makes consecutive emails visually distinct, so the right one is easy to
// spot even inside a collapsed thread.
function buildVerificationEmail({ firstName, verifyUrl, sentAt = new Date() }) {
  const greetName = firstName ? `, ${firstName}` : '';
  const sentLabel = appDateTimeStr(sentAt);
  const text = [
    `Welcome to AILA${greetName}.`,
    '',
    'Please verify your email address to activate your account.',
    '',
    `Verify your email: ${verifyUrl}`,
    '',
    `Sent ${sentLabel}.`,
    '',
    "This link expires in about 30 minutes. If you didn't create an AILA account, you can ignore this email.",
  ].join('\n');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h2 style="margin-bottom: 4px;">Welcome to AILA${greetName}.</h2>
      <p>Please verify your email address to activate your account.</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          Verify Email
        </a>
      </p>
      <p style="font-size: 12px; color: #9ca3af;">Sent ${sentLabel}.</p>
      <p style="font-size: 13px; color: #6b7280;">
        This link expires in about 30 minutes. If you didn't create an AILA account, you can safely ignore this email.
      </p>
    </div>
  `;

  return { subject: `Verify your AILA account (${appTimeStr(sentAt)})`, html, text };
}

async function sendVerificationEmail(user, verifyUrl) {
  const { subject, html, text } = buildVerificationEmail({ firstName: user.first_name, verifyUrl });
  return sendEmail({ to: user.email, subject, html, text });
}

// Same "distinct per-send subject/body" reasoning as buildVerificationEmail —
// a second forgot-password request groups into the same email thread as the
// first, so the send time keeps them visually distinct.
function buildPasswordResetEmail({ firstName, resetUrl, sentAt = new Date() }) {
  const greetName = firstName ? `, ${firstName}` : '';
  const sentLabel = appDateTimeStr(sentAt);
  const text = [
    `Hi${greetName},`,
    '',
    'We received a request to reset your AILA password.',
    '',
    `Reset your password: ${resetUrl}`,
    '',
    `Sent ${sentLabel}.`,
    '',
    "This link expires in about 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email — your password will not change.",
  ].join('\n');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h2 style="margin-bottom: 4px;">Reset your AILA password${greetName}.</h2>
      <p>We received a request to reset your password.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 12px; color: #9ca3af;">Sent ${sentLabel}.</p>
      <p style="font-size: 13px; color: #6b7280;">
        This link expires in about 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email — your password will not change.
      </p>
    </div>
  `;

  return { subject: `Reset your AILA password (${appTimeStr(sentAt)})`, html, text };
}

async function sendPasswordResetEmail(user, resetUrl) {
  const { subject, html, text } = buildPasswordResetEmail({ firstName: user.first_name, resetUrl });
  return sendEmail({ to: user.email, subject, html, text });
}

// Safe, presence-only startup diagnostic — never logs a credential VALUE,
// only whether each var is set. Intended to be called once at boot so a
// misconfiguration (missing SMTP var, or the console driver left on in
// production) shows up immediately in the server logs instead of only
// surfacing later as a silent delivery failure.
function logEmailConfigStatus() {
  const driver = getEmailDriver();
  console.log(`[emailService] Email driver: ${driver}`);

  if (driver !== 'smtp') {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[emailService] WARNING: EMAIL_DRIVER is not "smtp" in production — verification email will never actually be sent.');
    }
    return;
  }

  console.log(`[emailService] SMTP host configured: ${process.env.SMTP_HOST ? 'yes' : 'no'}`);
  console.log(`[emailService] SMTP user configured: ${process.env.SMTP_USER ? 'yes' : 'no'}`);
  console.log(`[emailService] SMTP password configured: ${process.env.SMTP_PASSWORD ? 'yes' : 'no'}`);
  console.log(`[emailService] Email sender configured: ${process.env.EMAIL_FROM ? 'yes' : 'no'}`);
}

module.exports = {
  getEmailDriver,
  logEmailConfigStatus,
  maskEmail,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  // exposed for unit tests only — not part of the intended public surface
  buildVerificationEmail,
  buildPasswordResetEmail,
};
