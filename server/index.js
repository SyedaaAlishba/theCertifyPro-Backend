require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const rateLimit     = require('express-rate-limit');
const session       = require('express-session');
const passport      = require('./middleware/passport');

// ── Environment Validation ────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'JWT_SECRET',
  'CLIENT_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL'
];

const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('\n❌ CRITICAL ERROR: Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\nPlease check your .env file. Exiting...\n');
  process.exit(1);
}

const { connectDB } = require('./utils/db');
const certRoutes = require('./routes/certificates');
const userRoutes = require('./routes/users');
const verifyRoutes = require('./routes/verify');
const uploadRoutes = require('./routes/uploads');
const paymentRoutes = require('./routes/payments');

const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for Render deployment to fix express-rate-limit IP tracking
app.set('trust proxy', 1);

// ── Ensure uploads directory exists ──────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Security & middleware ─────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      // connectSrc: ["'self'"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://*.netlify.app"],
      imgSrc: ["'self'", "data:", "https://*", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
}));
app.use(compression());
app.use(morgan(isProd ? 'combined' : 'dev'));

// Session MUST come before passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'certifypro_session_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,  // true for HTTPS (Render)
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());  // IMPORTANT - Add this line!

// CORS - Add production URLs
app.use(cors({
  origin: [
    'https://luxury-cranachan-5824d1.netlify.app',
    'https://thecertifypro-backend.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(options.statusCode).send(options.message);
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts. Try again in 15 mins.' },
  handler: (req, res, next, options) => {
    logger.security('Auth rate limit exceeded', { ip: req.ip });
    res.status(options.statusCode).send(options.message);
  },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Please wait before requesting another reset.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', resetLimiter);

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(uploadDir)));

// ── Root health check (Render / deployment probe) ─────────────────────────────
app.get('/', (req, res) => res.send('API is running'));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/certificates', certRoutes);
app.use('/api/users', userRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/payments', paymentRoutes);

// ── Health check (JSON) ───────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    db: 'mongodb',
    env: process.env.NODE_ENV || 'development',
  });
});

// ── Serve React build in production ──────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/build');
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  }
}

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled Route Error', { detail: err.stack, method: req.method, url: req.url });
  console.error('Server error:', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log('');
      console.log('  ╔═══════════════════════════════════════╗');
      console.log(`  ║  🎓 CertifyPro API  →  port ${PORT}      ║`);
      console.log(`  ║  DB:  MongoDB Atlas                   ║`);
      console.log(`  ║  Mode: ${(process.env.NODE_ENV || 'development').padEnd(30)}║`);
      console.log('  ╚═══════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
