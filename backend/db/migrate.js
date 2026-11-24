require('dotenv').config();
const { query } = require('./pool');

async function migrate() {
  console.log('🚀 Running SamayalAI migrations...\n');
  const tables = ['audit_log','chat_history','meal_plans','saved_recipes','recipes_cache','sessions','user_profiles','users'];
  for (const t of tables) {
    await query(`DROP TABLE IF EXISTS ${t} CASCADE`).catch(() => {});
  }
  console.log('✅ Cleared old tables');

  await query(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      avatar_initials VARCHAR(3),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )`);
  console.log('✅ users');

  await query(`
    CREATE TABLE user_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state VARCHAR(100), city VARCHAR(100), country VARCHAR(100) DEFAULT 'India',
      preferred_regions TEXT[] DEFAULT '{}',
      favorite_dishes TEXT[] DEFAULT '{}',
      dietary_preference VARCHAR(50) DEFAULT 'both',
      spice_level VARCHAR(20) DEFAULT 'medium',
      health_goals TEXT[] DEFAULT '{}',
      allergies TEXT[] DEFAULT '{}',
      cooking_skill VARCHAR(20) DEFAULT 'beginner',
      onboarding_complete BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  console.log('✅ user_profiles');

  await query(`
    CREATE TABLE sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      ip_address VARCHAR(50), user_agent TEXT,
      is_valid BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )`);
  console.log('✅ sessions');

  await query(`
    CREATE TABLE recipes_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dish_name VARCHAR(255) NOT NULL,
      dish_name_tamil VARCHAR(255),
      region VARCHAR(100),
      recipe_data JSONB NOT NULL,
      youtube_links JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  console.log('✅ recipes_cache');

  await query(`
    CREATE TABLE meal_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      plan_data JSONB NOT NULL,
      total_calories INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  console.log('✅ meal_plans');

  await query(`
    CREATE TABLE chat_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR(100),
      role VARCHAR(10) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  console.log('✅ chat_history');

  await query(`
    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      ip_address VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  console.log('✅ audit_log');

  // Indexes
  await query(`CREATE INDEX idx_users_email ON users(email)`);
  await query(`CREATE INDEX idx_sessions_token ON sessions(token_hash)`);
  await query(`CREATE INDEX idx_sessions_valid ON sessions(user_id, is_valid)`);
  await query(`CREATE INDEX idx_chat_user ON chat_history(user_id, created_at DESC)`);
  console.log('✅ Indexes');

  console.log('\n🎉 Migration complete! Database ready.\n');
  process.exit(0);
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
