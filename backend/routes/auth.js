require('dotenv').config();
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { body, validationResult } = require('express-validator');
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

async function makeSession(userId, req) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const hash  = crypto.createHash('sha256').update(token).digest('hex');
  const exp   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (user_id,token_hash,ip_address,user_agent,expires_at) VALUES ($1,$2,$3,$4,$5)',
    [userId, hash, req.ip, req.headers['user-agent'] || '', exp]
  );
  return token;
}

// POST /api/auth/register
router.post('/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty())
      return res.status(400).json({ success: false, errors: errs.array() });

    const { name, email, password } = req.body;
    try {
      const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
      if (exists.rows.length)
        return res.status(409).json({ success: false, error: 'Email already registered. Please sign in.' });

      const hash     = await bcrypt.hash(password, 12);
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
      const result   = await query(
        'INSERT INTO users (name,email,password_hash,avatar_initials) VALUES ($1,$2,$3,$4) RETURNING id,name,email,avatar_initials',
        [name, email, hash, initials]
      );
      const user = result.rows[0];
      await query('INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);

      const token = await makeSession(user.id, req);
      return res.status(201).json({
        success: true,
        message: `Welcome to SamayalAI, ${user.name}! 🎉`,
        token,
        user: { id: user.id, name: user.name, email: user.email, initials: user.avatar_initials },
        onboardingRequired: true,
      });
    } catch (err) {
      console.error('Register error:', err.message);
      const isDB = /timeout|terminated|ECONNREFUSED/i.test(err.message);
      return res.status(500).json({
        success: false,
        error: isDB
          ? 'Database is starting up (Neon free tier). Wait 10 seconds and try again.'
          : 'Registration failed. Please try again.',
      });
    }
  }
);

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await query(
        'SELECT id,name,email,password_hash,avatar_initials,is_active FROM users WHERE email=$1',
        [email]
      );
      const user = result.rows[0];
      if (!user || !user.is_active)
        return res.status(401).json({ success: false, error: 'No account found with this email.' });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok)
        return res.status(401).json({ success: false, error: 'Incorrect password.' });

      const profile = await query(
        'SELECT onboarding_complete,state,city,spice_level,dietary_preference,health_goals,favorite_dishes FROM user_profiles WHERE user_id=$1',
        [user.id]
      );
      await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]).catch(() => {});
      const token = await makeSession(user.id, req);
      return res.json({
        success: true,
        message: `Welcome back, ${user.name}! 🙏`,
        token,
        user: { id: user.id, name: user.name, email: user.email, initials: user.avatar_initials },
        onboardingRequired: !(profile.rows[0] || {}).onboarding_complete,
        profile: profile.rows[0] || {},
      });
    } catch (err) {
      console.error('Login error:', err.message);
      const isDB = /timeout|terminated|ECONNREFUSED/i.test(err.message);
      return res.status(500).json({
        success: false,
        error: isDB ? 'Database is starting up. Wait 10 seconds.' : 'Login failed.',
      });
    }
  }
);

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  await query('UPDATE sessions SET is_valid=false WHERE token_hash=$1', [req.tokenHash]).catch(() => {});
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const r = await query(
    'SELECT up.*,u.name,u.email,u.avatar_initials,u.created_at FROM user_profiles up JOIN users u ON u.id=up.user_id WHERE up.user_id=$1',
    [req.user.id]
  );
  res.json({ success: true, user: r.rows[0] || {} });
});

// POST /api/auth/onboarding
router.post('/onboarding', authenticate, async (req, res) => {
  const { state, city, country, preferred_regions, favorite_dishes,
          dietary_preference, spice_level, health_goals, allergies, cooking_skill } = req.body;
  try {
    await query(
      `UPDATE user_profiles SET state=$1,city=$2,country=$3,preferred_regions=$4,favorite_dishes=$5,
       dietary_preference=$6,spice_level=$7,health_goals=$8,allergies=$9,cooking_skill=$10,
       onboarding_complete=true,updated_at=NOW() WHERE user_id=$11`,
      [state||null,city||null,country||'India',preferred_regions||[],favorite_dishes||[],
       dietary_preference||'both',spice_level||'medium',health_goals||[],allergies||[],
       cooking_skill||'beginner',req.user.id]
    );
    res.json({ success: true, message: 'Profile saved!' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to save preferences.' });
  }
});

module.exports = router;
