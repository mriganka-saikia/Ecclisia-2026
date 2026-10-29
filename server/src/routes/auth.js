import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { cfg } from '../config.js';
import { HttpError, bad, conflict } from '../errors.js';
import { sign, parse, emailAllowed, publicUser } from '../auth.js';
import { sendOtp } from '../mailer.js';
import { grantWelcome } from '../lib/ledger.js';

const r = Router();
const hashOtp = (code, email) => crypto.createHash('sha256').update(`${code}:${email}`).digest('hex');

async function issueOtp(email) {
  const code = String(crypto.randomInt(100000, 1000000));
  await query(`UPDATE users SET otp_hash = $1, otp_expires = now() + interval '10 minutes', otp_attempts = 0 WHERE email = $2`, [hashOtp(code, email), email]);
  await sendOtp(email, code).catch((e) => console.warn('[mail] failed:', e.message));
  return code;
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  department: z.string().trim().max(80).optional().default(''),
  year: z.string().trim().max(20).optional().default(''),
});

r.post('/register', async (req, res) => {
  const d = parse(registerSchema, req.body);
  if (!emailAllowed(d.email)) throw new HttpError(403, `Sign up with your college email (@${cfg.domains[0]})`);
  const ex = (await query('SELECT verified FROM users WHERE email = $1', [d.email])).rows[0];
  if (ex?.verified) throw conflict('That email is already registered — sign in instead');
  const hash = await bcrypt.hash(d.password, 10);
  if (ex) await query('UPDATE users SET name=$1, password_hash=$2, department=$3, year=$4 WHERE email=$5', [d.name, hash, d.department, d.year, d.email]);
  else await query('INSERT INTO users (email, name, password_hash, department, year) VALUES ($1,$2,$3,$4,$5)', [d.email, d.name, hash, d.department, d.year]);
  const code = await issueOtp(d.email);
  res.status(201).json({ ok: true, email: d.email, devOtp: cfg.demoMode ? code : undefined });
});

r.post('/resend', async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
  const u = (await query('SELECT verified FROM users WHERE email = $1', [email])).rows[0];
  if (!u || u.verified) return res.json({ ok: true });
  const code = await issueOtp(email);
  res.json({ ok: true, devOtp: cfg.demoMode ? code : undefined });
});

r.post('/verify', async (req, res) => {
  const { email, code } = parse(z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().trim().length(6) }), req.body);
  const u = (await query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  if (!u) throw bad('Unknown email');
  if (u.verified) throw conflict('Already verified — sign in');
  if (!u.otp_hash || new Date(u.otp_expires) < new Date()) throw bad('Code expired — request a new one');
  if (u.otp_attempts >= 5) throw new HttpError(429, 'Too many attempts — request a new code');
  if (hashOtp(code, email) !== u.otp_hash) {
    await query('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1', [u.id]);
    throw bad('Incorrect code');
  }
  await tx(async (t) => {
    await t.query('UPDATE users SET verified = true, otp_hash = NULL, otp_expires = NULL WHERE id = $1', [u.id]);
    await grantWelcome(t, u.id);
  });
  const fresh = (await query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
  res.json({ token: sign(u.id), user: publicUser(fresh) });
});

r.post('/login', async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }), req.body);
  const u = (await query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Wrong email or password');
  if (!u.verified) throw new HttpError(403, 'Verify your email first', { needsVerification: true, email });
  res.json({ token: sign(u.id), user: publicUser(u) });
});

export default r;
