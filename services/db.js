const { Pool } = require('pg');

/*
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'jikoni',
  password: process.env.DB_PASSWORD || 'Pass_123',
  port: process.env.DB_PORT || 5432,
});*/


// Create a PostgreSQL connection pool for live cloud db
const pool = new Pool({

host: 'ep-sweet-thunder-a50yx78z-pooler.us-east-2.aws.neon.tech',
database:'jikoni',
user: 'master_db_owner',
password: 'FV4RGtQmS6dL',

ssl: {
  rejectUnauthorized: false, // Option to allow self-signed certificates if necessary
}, 
 
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('PostgreSQL connection error:', err);
  else console.log('Connected to PostgreSQL at:', res.rows[0].now);
});

module.exports = pool;



