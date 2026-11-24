const express = require('express');
const router  = express.Router();
const { authenticate }   = require('../middleware/auth');
const { aiLimiter }      = require('../middleware/rateLimiter');
const { getChatResponse, getRecipe, getMealPlan } = require('../services/groq');
const { query }          = require('../db/pool');

// POST /api/ai/chat
router.post('/chat', authenticate, aiLimiter, async (req, res) => {
  const { message, session_id } = req.body;
  if (!message?.trim()) return res.status(400).json({ success: false, error: 'Message required' });

  try {
    let history = [];
    try {
      const h = await query(
        'SELECT role,content FROM chat_history WHERE user_id=$1 AND session_id=$2 ORDER BY created_at ASC LIMIT 20',
        [req.user.id, session_id || '']
      );
      history = h.rows;
    } catch (_) {}

    let profile = null;
    try {
      const p = await query('SELECT * FROM user_profiles WHERE user_id=$1', [req.user.id]);
      profile = p.rows[0] || null;
    } catch (_) {}

    history.push({ role: 'user', content: message });
    const reply = await getChatResponse(history, profile);

    const sid = session_id || require('crypto').randomUUID();
    try {
      await query(
        'INSERT INTO chat_history (user_id,session_id,role,content) VALUES ($1,$2,$3,$4)',
        [req.user.id, sid, 'user', message]
      );
      await query(
        'INSERT INTO chat_history (user_id,session_id,role,content) VALUES ($1,$2,$3,$4)',
        [req.user.id, sid, 'assistant', reply]
      );
    } catch (_) {}

    res.json({ success: true, reply, session_id: sid });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ success: false, error: 'AI service error: ' + err.message });
  }
});

// POST /api/ai/recipe
router.post('/recipe', authenticate, aiLimiter, async (req, res) => {
  const { query: q, servings } = req.body;
  if (!q?.trim()) return res.status(400).json({ success: false, error: 'Recipe query required' });

  try {
    let profile = null;
    try {
      const p = await query('SELECT * FROM user_profiles WHERE user_id=$1', [req.user.id]);
      profile = p.rows[0] || null;
    } catch (_) {}

    const { data, fromCache } = await getRecipe(q, profile, req.user.id, servings);
    res.json({ success: true, recipe: data, fromCache });
  } catch (err) {
    console.error('Recipe error:', err.message);
    res.status(500).json({ success: false, error: 'Could not generate recipe: ' + err.message });
  }
});

// POST /api/ai/meal-plan
router.post('/meal-plan', authenticate, aiLimiter, async (req, res) => {
  try {
    let profile = null;
    try {
      const p = await query('SELECT * FROM user_profiles WHERE user_id=$1', [req.user.id]);
      profile = p.rows[0] || null;
    } catch (_) {}

    // Check for existing plan
    if (!req.body.regenerate) {
      try {
        const ex = await query(
          'SELECT plan_data FROM meal_plans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
          [req.user.id]
        );
        if (ex.rows.length) return res.json({ success: true, plan: ex.rows[0].plan_data, fromCache: true });
      } catch (_) {}
    }

    const plan = await getMealPlan(profile, req.user.id);
    res.json({ success: true, plan, fromCache: false });
  } catch (err) {
    console.error('Meal plan error:', err.message);
    res.status(500).json({ success: false, error: 'Could not generate meal plan: ' + err.message });
  }
});

module.exports = router;
