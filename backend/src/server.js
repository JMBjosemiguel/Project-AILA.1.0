const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ quiet: true });

const { testConnection } = require('./config/database');
const routes = require('./routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { notFoundHandler } = require('./middlewares/notFoundHandler');
const { apiRateLimiter } = require('./middlewares/apiRateLimiter');
const { logEmailConfigStatus } = require('./services/emailService');
const { formatStartupError } = require('./utils/formatStartupError');

// A rejected promise with no .catch, or a genuinely unexpected synchronous
// throw, must never take the whole process down with it — that would end
// every other student's in-flight request too, not just the one that hit the
// bug. Logging-and-continuing is a deliberate tradeoff here: the alternative
// (exit and let Render restart) turns one rare bug into a full outage.
process.on('unhandledRejection', (reason) => {
  const detail = reason && reason.code ? `${reason.code} ${reason.message}` : reason;
  console.error('[process] unhandledRejection:', detail);
});
process.on('uncaughtException', (error) => {
  console.error('[process] uncaughtException:', error && error.code ? `${error.code} ${error.message}` : error);
});

function logMemoryUsage(label) {
  const usage = process.memoryUsage();
  const mb = (bytes) => Math.round(bytes / (1024 * 1024));
  console.log(`[memory] ${label}: rss=${mb(usage.rss)}MB heapUsed=${mb(usage.heapUsed)}MB external=${mb(usage.external)}MB`);
}

const app = express();
const port = Number(process.env.PORT || 5000);
const SLOW_REQUEST_MS = 5000;

function parseAllowedOrigins() {
  return [
    process.env.APP_URL,
    process.env.CORS_ORIGINS,
    process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173',
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins();

app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startedAt;
    if (elapsed > SLOW_REQUEST_MS) {
      console.warn(`[slow-request] ${req.method} ${req.path} took ${elapsed}ms`);
      logMemoryUsage(`after slow request (${req.method} ${req.path})`);
    }
  });
  next();
});

// Render's load balancer is the only reverse proxy in front of this service
// (it forwards the request to the app directly — see docs/DEPLOYMENT.md #10);
// Cloudflare in this stack only fronts the separate static frontend (Pages)
// and object storage (R2), never this API, so there is exactly one hop to
// trust. `trust proxy: 1` makes req.ip resolve to the real visitor IP from
// X-Forwarded-For instead of Render's own edge IP, so this limiter counts
// each visitor separately. Production's morgan 'combined' log already prints
// the resolved IP (:remote-addr) on every line — if that ever looks wrong, or
// a CDN/proxy is ever added in front of this API, this number needs revisiting.
app.use('/api', apiRateLimiter);

app.get('/health', async (req, res) => {
  let database = 'ok';
  try {
    await Promise.race([
      testConnection(),
      new Promise((_resolve, reject) => { setTimeout(() => reject(new Error('timeout')), 2000); }),
    ]);
  } catch {
    database = 'error';
  }
  // Always 200 (process is up) even if the DB ping failed — Render's health
  // check restarting the whole service over a momentary DB blip would turn a
  // brief freeze into a full outage, the opposite of this fix's goal.
  res.status(200).json({ status: 'ok', service: 'aila-backend', database });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await testConnection();
    // Non-fatal by design — a misconfigured or unreachable email provider
    // must never prevent the server from starting.
    try {
      logEmailConfigStatus();
    } catch (emailConfigError) {
      console.error('[emailService] startup diagnostic failed:', emailConfigError.message);
    }
    app.listen(port, '0.0.0.0', () => {
      console.log(`AILA backend running on port ${port}`);
      logMemoryUsage('startup');
    });
  } catch (error) {
    console.error(`Unable to start backend: ${formatStartupError(error, { host: process.env.DB_HOST, port: process.env.DB_PORT })}`);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
