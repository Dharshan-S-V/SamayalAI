require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      scriptSrc  : ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc   : ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc    : ["'self'", "https://fonts.gstatic.com"],
      imgSrc     : ["'self'", "data:", "https:"],
      connectSrc : ["'self'", "https://api.groq.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); }
}));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ai',   require('./routes/ai'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'SamayalAI', version: '1.0.0' }));

// Frontend pages
const pages = ['login', 'register', 'onboarding', 'dashboard', 'planner', 'profile'];
pages.forEach(p => {
  app.get('/' + p, (req, res) =>
    res.sendFile(path.join(__dirname, '../frontend/pages/' + p + '.html')));
});

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/index.html')));

// 404
app.use('/api/*', (req, res) => res.status(404).json({ success: false, error: 'Not found' }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '../frontend/pages/404.html')));

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  🍛  SamayalAI is RUNNING               ║
║  🌐  http://localhost:${PORT}               ║
║  🤖  AI: Groq llama-3.3-70b             ║
║  📦  DB: Neon PostgreSQL                ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
