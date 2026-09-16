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

function buildVerificationEmail({ firstName, verifyUrl }) {
  const greetName = firstName ? `, ${firstName}` : '';
  const text = [
    `Welcome to AILA${greetName}.`,
    '',
    'Please verify your email address to activate your account.',
    '',
    `Verify your email: ${verifyUrl}`,
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
      <p style="font-size: 13px; color: #6b7280;">
        This link expires in about 30 minutes. If you didn't create an AILA account, you can safely ignore this email.
      </p>
    </div>
  `;

  return { subject: 'Verify your AILA email address', html, text };
}

async function sendVerificationEmail(user, verifyUrl) {
  const { subject, html, text } = buildVerificationEmail({ firstName: user.first_name, verifyUrl });
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
};
