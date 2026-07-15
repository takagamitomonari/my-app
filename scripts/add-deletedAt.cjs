const dotenv = require('dotenv');
dotenv.config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz');
    console.log('ALTER TABLE applied: deletedAt added (if not exists)');
  } catch (e) {
    console.error('ALTER TABLE failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
