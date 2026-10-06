#!/usr/bin/env node
/**
 * Crea un usuario admin en la BD self-host.
 * Uso: DATABASE_URL=... node scripts/create-admin.mjs admin@local 'Secreto123' 'Admin'
 */
import pg from 'pg';
import bcrypt from 'bcrypt';

const [email, password, fullName = 'Admin'] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url || !email || !password) {
  console.error('Uso: DATABASE_URL=... node scripts/create-admin.mjs <email> <password> [nombre]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const hash = await bcrypt.hash(password, 10);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    `INSERT INTO public.users (email, password_hash, full_name, raw_user_meta_data, raw_app_meta_data)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name
     RETURNING id`,
    [
      email.trim().toLowerCase(),
      hash,
      fullName,
      JSON.stringify({ role: 'admin', full_name: fullName }),
      JSON.stringify({ role: 'admin' }),
    ],
  );
  const id = rows[0].id;
  await client.query(
    `UPDATE public.profiles SET role = 'admin', full_name = COALESCE($2, full_name) WHERE id = $1`,
    [id, fullName],
  );
  await client.query('COMMIT');
  console.log('OK admin', email, id);
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
