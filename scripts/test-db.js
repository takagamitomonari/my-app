const dotenv = require('dotenv');
dotenv.config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query('SELECT 1', (err, res) => {
  if (err) {
    console.error('CONN_ERR', err.message);
    process.exit(2);
  } else {
    console.log('CONN_OK');
    process.exit(0);
  }
});
