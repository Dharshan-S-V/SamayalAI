require('dotenv').config();
const { Pool } = require('pg');

let url = (process.env.DATABASE_URL || '')
  .replace(/[&?]channel_binding=[^&]*/g, '')
  .replace(/\?$/, '');

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 25000,
  idleTimeoutMillis: 30000,
});

pool.on('connect', () => console.log('📦 DB connected'));
pool.on('error', e => console.error('DB error:', e.message));

async function query(text, params, retries = 2) {
  for (let i = 1; i <= retries; i++) {
    let client;
    try {
      client = await pool.connect();
      return await client.query(text, params);
    } catch (err) {
      console.error(`DB attempt ${i}/${retries}:`, err.message);
      if (i < retries && /timeout|terminated|ECONNREFUSED/i.test(err.message)) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    } finally {
      if (client) client.release();
    }
  }
}

module.exports = { pool, query };
