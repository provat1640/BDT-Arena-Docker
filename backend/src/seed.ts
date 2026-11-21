import bcrypt from 'bcryptjs';
import { pool } from './db.js';

await pool.query(`INSERT INTO users (phone, email, password_hash, role)
VALUES
  ('+8801700000001', 'admin@bdtarena.local', $1, 'admin'),
  ('+8801700000002', 'demo@bdtarena.local', $2, 'user')
ON CONFLICT (phone) DO NOTHING`, [
  await bcrypt.hash('Admin123!Sandbox', 12),
  await bcrypt.hash('Demo123!Sandbox', 12)
]);

await pool.query(`INSERT INTO wallets (user_id, balance_minor)
SELECT id, CASE WHEN role = 'admin' THEN 100000 ELSE 250000 END
FROM users
WHERE email IN ('admin@bdtarena.local', 'demo@bdtarena.local')
ON CONFLICT (user_id) DO NOTHING`);

await pool.end();
console.log('Seed completed: admin@bdtarena.local / demo@bdtarena.local');
