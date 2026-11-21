import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));
