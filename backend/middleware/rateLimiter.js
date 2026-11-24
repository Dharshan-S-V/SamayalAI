const rateLimit = require('express-rate-limit');
const isDev = process.env.NODE_ENV !== 'production';

const make = (windowMin, max, msg) => rateLimit({
  windowMs: windowMin * 60 * 1000,
  max,
  skip: () => isDev,
  message: { success: false, error: msg },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter:   make(15, 200, 'Too many requests.'),
  authLimiter:  make(15,  20, 'Too many auth attempts.'),
  aiLimiter:    make(1,   30, 'AI limit reached. Wait a minute.'),
};
