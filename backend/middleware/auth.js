const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db/pool');

async function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer '))
      return res.status(401).json({ success: false, error: 'No token provided' });

    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const sess = await query(
      'SELECT id FROM sessions WHERE token_hash=$1 AND is_valid=true AND expires_at>NOW()',
      [hash]
    );
    if (!sess.rows.length)
      return res.status(401).json({ success: false, error: 'Session expired' });

    const user = await query('SELECT id,name,email,is_active FROM users WHERE id=$1', [decoded.userId]);
    if (!user.rows.length || !user.rows[0].is_active)
      return res.status(401).json({ success: false, error: 'User not found' });

    req.user = user.rows[0];
    req.tokenHash = hash;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

module.exports = { authenticate };
