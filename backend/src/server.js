const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ quiet: true });

const { testConnection } = require('./config/database');
const routes = require('./routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { notFoundHandler } = require('./middlewares/notFoundHandler');

const app = express();
const port = Number(process.env.PORT || 5000);

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

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'aila-backend' });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await testConnection();
    app.listen(port, '0.0.0.0', () => {
      console.log(`AILA backend running on port ${port}`);
    });
  } catch (error) {
    console.error('Unable to start backend:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
