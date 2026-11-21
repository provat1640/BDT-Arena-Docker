import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.js';

const sql = await fs.readFile(path.join(process.cwd(), 'src/db/migration.sql'), 'utf8');
await pool.query(sql);
await pool.end();
console.log('Database migration completed');
