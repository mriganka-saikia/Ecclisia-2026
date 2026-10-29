import { Router } from 'express';
import { z } from 'zod';
import { query, tx, dbKind } from '../db.js';
import { cfg, CATEGORIES, LEVELS, DURATIONS, WEIGHTS } from '../config.js';
import { bad, notFound } from '../errors.js';
import { requireAuth, parse, publicUser } from '../auth.js';
import { search } from '../services/match.js';
import { freeIntervals, slotStarts } from '../services/slots.js';
import { createSession, confirmSession, cancelSession, reviewSession, listSessions, SESSION_SELECT, shapeSession } from '../services/sessions.js';
import { balances, verifyLedger } from '../lib/ledger.js';
import { embedSkillById, embeddingsEnabled } from '../lib/embeddings.js';
import { tokens, lexScore } from '../lib/text.js';
import { dateKey, dayRangeUtc, nextDays, absToDate, toAbs } from '../time.js';

const r = Router();
const shortName = (n) => { const p = (n || '?').split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };

// ---------- public
r.get('/meta', (_q, res) => res.json({
  categories: CATEGORIES, levels: LEVELS, durations: DURATIONS, weights: WEIGHTS, demoMode: cfg.demoMode,
  dailyCapHours: cfg.dailyCapMin / 60, welcomeHours: cfg.welcomeMin / 60, collegeDomain: cfg.domains[0], aiSearch: embeddingsEnabled(), db: dbKind,
}));
r.get('/stats', async (_q, res) => {
  const [u, s, k] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM users WHERE verified'),
    query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(minutes),0)::int AS m FROM sessions WHERE status='completed'`),
    query(`SELECT COUNT(*)::int AS n FROM skills WHERE kind='offer' AND active`),
  ]);
  res.json({ students: u.rows[0].n, sessions: s.rows[0].n, hours: Math.round((s.rows[0].m / 60) * 10) / 10, skills: k.rows[0].n });
});

// ---------- everything below needs a signed-in student
r.use(requireAuth);

r.get('/me', async (req, res) => {
  const u = (await query('SELECT * FROM users WHERE id = $1', [req.userId])).rows[0];
  if (!u) throw notFound('Account not found');
  res.json(publicUser(u));
});
r.patch('/me', async (req, res) => {
  const d = parse(z.object({ name: z.string().trim().min(2).max(80), department: z.string().trim().max(80).default(''), year: z.string().trim().max(20).default(''), bio: z.string().trim().max(400).default('') }), req.body);
  const u = (await query('UPDATE users SET name=$1, department=$2, year=$3, bio=$4 WHERE id=$5 RETURNING *', [d.name, d.department, d.year, d.bio, req.userId])).rows[0];
  res.json(publicUser(u));
});

// ---------- skills
r.get('/me/skills', async (req, res) => {
  const { rows } = await query(`SELECT id, kind, title, category, level, description FROM skills WHERE user_id = $1 AND active ORDER BY created_at DESC`, [req.userId]);
  res.json(rows);
});
r.post('/skills', async (req, res) => {
  const d = parse(z.object({
    kind: z.enum(['offer', 'want']), title: z.string().trim().min(2).max(80),
    category: z.enum(CATEGORIES), level: z.enum(LEVELS).default('all'), description: z.string().trim().max(400).default(''),
  }), req.body);
  const dup = (await query(`SELECT 1 FROM skills WHERE user_id=$1 AND kind=$2 AND active AND lower(title)=lower($3)`, [req.userId, d.kind, d.title])).rows;
  if (dup.length) throw bad('You already listed that');
  const s = (await query(`INSERT INTO skills (user_id, kind, title, category, level, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, kind, title, category, level, description`,
    [req.userId, d.kind, d.title, d.category, d.level, d.description])).rows[0];
  if (d.kind === 'offer') embedSkillById(s.id).catch(() => {});
  res.status(201).json(s);
});
r.delete('/skills/:id', async (req, res) => {
  await query('UPDATE skills SET active = false WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.userId]);
  res.json({ ok: true });
});
r.get('/skills/:id', async (req, res) => {
  const row = (await query(
    `SELECT s.id, s.title, s.category, s.level, s.description, u.id AS mid, u.name, u.department, u.year, u.bio, u.rating_avg, u.rating_count
       FROM skills s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.kind='offer' AND s.active`, [Number(req.params.id)])).rows[0];
  if (!row) throw notFound('Skill not found');
  const [rev, taught, others] = await Promise.all([
    query(`SELECT rv.rating, rv.comment, rv.created_at, u.name FROM reviews rv JOIN users u ON u.id = rv.reviewer_id WHERE rv.mentor_id = $1 ORDER BY rv.created_at DESC LIMIT 5`, [row.mid]),
    query(`SELECT COALESCE(SUM(minutes),0)::int AS m, COUNT(*)::int AS n FROM sessions WHERE mentor_id=$1 AND status='completed'`, [row.mid]),
    query(`SELECT id, title FROM skills WHERE user_id=$1 AND kind='offer' AND active AND id <> $2`, [row.mid, row.id]),
  ]);
  res.json({
    skill: { id: row.id, title: row.title, category: row.category, level: row.level, description: row.description },
    mentor: { id: row.mid, name: row.name, department: row.department, year: row.year, bio: row.bio, rating_avg: row.rating_avg, rating_count: row.rating_count, hours_taught: taught.rows[0].m / 60, sessions: taught.rows[0].n },
    reviews: rev.rows.map((x) => ({ rating: x.rating, comment: x.comment, created_at: x.created_at, by: shortName(x.name) })),
    other_skills: others.rows,
  });
});
r.get('/skills/:id/slots', async (req, res) => {
  const minutes = Number(req.query.minutes) || 60;
  if (!DURATIONS.includes(minutes)) throw bad('Bad duration');
  const sk = (await query(`SELECT user_id FROM skills WHERE id = $1 AND kind='offer' AND active`, [Number(req.params.id)])).rows[0];
  if (!sk) throw notFound('Skill not found');
  const free = (await freeIntervals([sk.user_id], { viewerId: req.userId })).get(sk.user_id) || [];
  const starts = slotStarts(free, minutes);
  const byDay = new Map();
  for (const s of starts) {
    const k = dateKey(absToDate(s));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(absToDate(s).toISOString());
  }
  res.json({ minutes, days: [...byDay].map(([date, slots]) => ({ date, slots })) });
});

// ---------- availability (recurring weekly windows)
r.get('/availability', async (req, res) => {
  res.json((await query('SELECT weekday, start_min, end_min FROM availability WHERE user_id=$1 ORDER BY weekday, start_min', [req.userId])).rows);
});
r.put('/availability', async (req, res) => {
  const { windows } = parse(z.object({ windows: z.array(z.object({ weekday: z.number().int().min(0).max(6), start_min: z.number().int().min(0).max(1410), end_min: z.number().int().min(30).max(1440) })).max(60) }), req.body);
  for (const w of windows) if (w.end_min <= w.start_min || w.start_min % 30 || w.end_min % 30) throw bad('Windows must be on 30-minute steps and end after they start');
  await tx(async (t) => {
    await t.query('DELETE FROM availability WHERE user_id = $1', [req.userId]);
    for (const w of windows) await t.query('INSERT INTO availability (user_id, weekday, start_min, end_min) VALUES ($1,$2,$3,$4)', [req.userId, w.weekday, w.start_min, w.end_min]);
  });
  res.json({ ok: true, count: windows.length });
});

// ---------- AI-assisted search + weighted matching
r.post('/search', async (req, res) => {
  const d = parse(z.object({ q: z.string().trim().max(200).default(''), category: z.string().max(40).default('') }), req.body);
  res.json(await search({ me: req.userId, q: d.q, category: d.category }));
});

// ---------- sessions
const sessionById = async (id, me) => shapeSession((await query(`${SESSION_SELECT} WHERE se.id = $1`, [id])).rows[0], me);
r.get('/sessions', async (req, res) => res.json(await listSessions(req.userId)));
r.post('/sessions', async (req, res) => {
  const d = parse(z.object({ skill_id: z.number().int(), start_at: z.string(), minutes: z.number().int(), note: z.string().max(280).optional() }), req.body);
  const id = await createSession(req.userId, { skillId: d.skill_id, startAt: d.start_at, minutes: d.minutes, note: d.note });
  res.status(201).json(await sessionById(id, req.userId));
});
r.post('/sessions/:id/confirm', async (req, res) => {
  const out = await confirmSession(req.userId, Number(req.params.id));
  res.json({ ...out, session: await sessionById(Number(req.params.id), req.userId) });
});
r.post('/sessions/:id/cancel', async (req, res) => {
  await cancelSession(req.userId, Number(req.params.id));
  res.json(await sessionById(Number(req.params.id), req.userId));
});
r.post('/sessions/:id/review', async (req, res) => {
  const d = parse(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }), req.body);
  await reviewSession(req.userId, Number(req.params.id), d);
  res.json(await sessionById(Number(req.params.id), req.userId));
});

// ---------- wallet + transparent ledger
r.get('/wallet', async (req, res) => {
  const me = req.userId;
  const bal = await balances({ query }, me);
  const rows = (await query(
    `SELECT l.seq, l.type, l.bucket, l.delta, l.memo, l.hash, l.created_at, l.session_id, sk.title AS skill_title
       FROM ledger l LEFT JOIN sessions se ON se.id = l.session_id LEFT JOIN skills sk ON sk.id = se.skill_id
      WHERE l.user_id = $1 ORDER BY l.seq ASC`, [me])).rows;
  let av = 0, held = 0;
  const hist = rows.map((x) => {
    if (x.bucket === 'available') av += x.delta; else held += x.delta;
    return { seq: x.seq, type: x.type, bucket: x.bucket, minutes: x.delta, memo: x.memo, skill_title: x.skill_title, hash: x.hash.slice(0, 10), at: x.created_at, total_after: av + held };
  });
  const [d0, d1] = dayRangeUtc(dateKey(new Date()));
  const used = (await query(`SELECT COALESCE(SUM(minutes),0)::int AS m FROM sessions WHERE mentor_id=$1 AND status IN ('booked','completed') AND start_at >= $2 AND start_at < $3`, [me, d0.toISOString(), d1.toISOString()])).rows[0].m;
  res.json({ available: bal.available / 60, held: bal.held / 60, earn_cap: { used_hours: used / 60, cap_hours: cfg.dailyCapMin / 60 }, history: hist.reverse().slice(0, 80) });
});
r.get('/ledger/feed', async (_req, res) => {
  const { rows } = await query(`SELECT l.seq, l.txn_id, l.type, l.bucket, l.delta, l.hash, l.created_at, u.name FROM ledger l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.seq DESC LIMIT 60`);
  const groups = new Map();
  for (const x of rows) { if (!groups.has(x.txn_id)) groups.set(x.txn_id, []); groups.get(x.txn_id).push(x); }
  const feed = [...groups.values()].slice(0, 20).map((g) => {
    const first = g[g.length - 1];
    const neg = g.find((x) => x.delta < 0 && x.user_id !== null && x.name), pos = g.find((x) => x.delta > 0 && x.name);
    const minutes = Math.abs(g.find((x) => x.delta !== 0).delta);
    return { type: first.type, hours: minutes / 60, from: first.type === 'RELEASE' ? shortName(neg?.name) : null, to: pos ? shortName(pos.name) : null, who: shortName((pos || neg)?.name), hash: g[0].hash.slice(0, 10), at: first.created_at, seq: first.seq };
  });
  res.json(feed);
});
r.get('/ledger/verify', async (_req, res) => res.json(await verifyLedger({ query })));
r.get('/leaderboard', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { rows } = await query(
    `SELECT u.id, u.name, u.department, u.rating_avg, u.rating_count, SUM(se.minutes)::int AS m, COUNT(*)::int AS n
       FROM sessions se JOIN users u ON u.id = se.mentor_id WHERE se.status='completed' AND se.completed_at >= $1
      GROUP BY u.id ORDER BY m DESC LIMIT 5`, [since]);
  res.json(rows.map((x) => ({ id: x.id, name: x.name, department: x.department, hours: x.m / 60, sessions: x.n, rating_avg: x.rating_avg, rating_count: x.rating_count })));
});

// ---------- campus demand gap: skills students want that nobody teaches yet
r.get('/demand', async (req, res) => {
  const [wants, offers] = await Promise.all([
    query(`SELECT s.title, s.category, s.user_id FROM skills s JOIN users u ON u.id = s.user_id WHERE s.kind = 'want' AND s.active AND u.verified`),
    query(`SELECT s.title, s.category, s.description, s.user_id FROM skills s JOIN users u ON u.id = s.user_id WHERE s.kind = 'offer' AND s.active AND u.verified`),
  ]);
  const groups = new Map();
  for (const w of wants.rows) {
    const toks = tokens(w.title);
    const key = toks.join(' ') || w.title.toLowerCase();
    const g = groups.get(key) || { title: w.title, category: w.category, toks, users: new Set() };
    g.users.add(w.user_id);
    groups.set(key, g);
  }
  const gaps = [...groups.values()]
    .map((g) => ({
      title: g.title, category: g.category, wanters: g.users.size, mine: g.users.has(req.userId),
      teachers: new Set(offers.rows.filter((o) => lexScore(g.toks, o) >= 0.6).map((o) => o.user_id)).size,
    }))
    .filter((g) => g.teachers === 0)
    .sort((a, b) => b.wanters - a.wanters || a.title.localeCompare(b.title))
    .slice(0, 6);
  res.json({ gaps, total_wants: wants.rows.length });
});

export default r;
