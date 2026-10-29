import crypto from 'node:crypto';
import { tx, query } from '../db.js';
import { cfg, DURATIONS } from '../config.js';
import { bad, conflict, notFound, HttpError } from '../errors.js';
import { postTxn, balances } from '../lib/ledger.js';
import { dateKey, dayRangeUtc, localParts } from '../time.js';

const GRID = 30;

export const SESSION_SELECT = `
  SELECT se.id, se.status, se.start_at, se.end_at, se.minutes, se.meet_url, se.note, se.disputed_at, se.disputed_by, se.resolution,
         se.mentor_id, se.learner_id, se.mentor_confirmed_at, se.learner_confirmed_at, se.completed_at,
         sk.title AS skill_title, sk.category, m.name AS mentor_name, l.name AS learner_name,
         (r.id IS NOT NULL) AS reviewed, r.rating AS my_rating
    FROM sessions se
    JOIN skills sk ON sk.id = se.skill_id
    JOIN users m ON m.id = se.mentor_id
    JOIN users l ON l.id = se.learner_id
    LEFT JOIN reviews r ON r.session_id = se.id`;

const H = 3600_000;
function settlement(s, me) {
  const now = Date.now(), start = new Date(s.start_at).getTime(), end = new Date(s.end_at).getTime();
  let auto_at = null, auto_action = null;
  if (s.status === 'booked') {
    const attested = s.mentor_confirmed_at || s.learner_confirmed_at;
    auto_at = new Date(end + (attested ? cfg.autoReleaseHours : cfg.autoRefundHours) * H).toISOString();
    auto_action = attested ? 'release' : 'refund';
  } else if (s.status === 'disputed') {
    auto_at = new Date(new Date(s.disputed_at).getTime() + cfg.disputeDays * 24 * H).toISOString();
    auto_action = 'refund';
  }
  const can_dispute = s.status === 'booked' && s.learner_id === me && !s.learner_confirmed_at
    && (cfg.demoMode || now >= start) && now < end + cfg.autoReleaseHours * H;
  return { auto_at, auto_action, can_dispute, resolution: s.resolution || null, disputed_at: s.disputed_at || null };
}

export const shapeSession = (s, me) => ({
  ...settlement(s, me),
  id: s.id, status: s.status, start_at: s.start_at, end_at: s.end_at, minutes: s.minutes, credits: s.minutes / 60,
  skill_title: s.skill_title, category: s.category, meet_url: s.status === 'booked' ? s.meet_url : null, note: s.note,
  role: s.mentor_id === me ? 'mentor' : 'learner',
  mentor: { id: s.mentor_id, name: s.mentor_name }, learner: { id: s.learner_id, name: s.learner_name },
  confirmed: { mentor: !!s.mentor_confirmed_at, learner: !!s.learner_confirmed_at },
  reviewed: !!s.reviewed, my_rating: s.my_rating ?? null, can_confirm_now: cfg.demoMode || new Date() >= new Date(s.start_at),
});

export async function createSession(learnerId, { skillId, startAt, minutes, note = '' }) {
  if (!DURATIONS.includes(minutes)) throw bad('Duration must be 30, 60, 90 or 120 minutes');
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw bad('Invalid start time');
  const end = new Date(start.getTime() + minutes * 60_000);
  if (start.getTime() < Date.now() + 15 * 60_000) throw bad('Pick a time at least 15 minutes from now');
  if (start.getTime() > Date.now() + 14 * 86_400_000) throw bad('You can book up to 14 days ahead');

  return tx(async (t) => {
    const sk = (await t.query(`SELECT id, user_id, title FROM skills WHERE id = $1 AND kind='offer' AND active`, [skillId])).rows[0];
    if (!sk) throw notFound('This skill is no longer available');
    const mentorId = sk.user_id;
    if (mentorId === learnerId) throw bad('You cannot book your own session');

    // 1. lock both accounts in a fixed order so concurrent bookings serialise (prevents double-booking + double-spend)
    for (const id of [mentorId, learnerId].sort((a, b) => a - b)) await t.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id]);

    // 2. the slot must sit inside one of the mentor's weekly windows, on the 30-min grid
    const p = localParts(start), pe = localParts(end);
    if (p.minutes % GRID !== 0) throw bad('Start time must be on the hour or half hour');
    const win = (await t.query(`SELECT 1 FROM availability WHERE user_id = $1 AND weekday = $2 AND start_min <= $3 AND end_min >= $4`,
      [mentorId, p.weekday, p.minutes, p.minutes + minutes])).rows;
    if (!win.length || pe.d !== p.d) throw conflict('That time is outside the mentor\'s availability');

    // 3. no overlap for either person, in either role
    for (const [uid, who] of [[mentorId, 'The mentor'], [learnerId, 'You']]) {
      const clash = (await t.query(
        `SELECT 1 FROM sessions WHERE status = 'booked' AND (mentor_id = $1 OR learner_id = $1) AND start_at < $2 AND end_at > $3 LIMIT 1`,
        [uid, end.toISOString(), start.toISOString()])).rows;
      if (clash.length) throw conflict(`${who} ${uid === learnerId ? 'already have' : 'already has'} a session at that time`, { code: 'DOUBLE_BOOKED' });
    }

    // 4. daily earn cap (anti-abuse): mentor can't earn more than the cap on one campus day
    const [d0, d1] = dayRangeUtc(dateKey(start));
    const used = (await t.query(
      `SELECT COALESCE(SUM(minutes),0)::int AS m FROM sessions WHERE mentor_id = $1 AND status IN ('booked','completed') AND start_at >= $2 AND start_at < $3`,
      [mentorId, d0.toISOString(), d1.toISOString()])).rows[0].m;
    if (used + minutes > cfg.dailyCapMin) throw conflict(`This mentor has reached the daily earn cap (${cfg.dailyCapMin / 60}h) for that day`, { code: 'EARN_CAP' });

    // 5. escrow: move credits from available -> held
    const bal = await balances(t, learnerId);
    if (bal.available < minutes) throw new HttpError(402, `Not enough credits: you need ${minutes / 60}, you have ${bal.available / 60}. Teach a session to earn more!`, { code: 'INSUFFICIENT_CREDITS' });

    const meet = `https://meet.jit.si/timebank-${crypto.randomBytes(6).toString('hex')}`;
    const s = (await t.query(
      `INSERT INTO sessions (skill_id, mentor_id, learner_id, start_at, end_at, minutes, meet_url, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [skillId, mentorId, learnerId, start.toISOString(), end.toISOString(), minutes, meet, String(note).slice(0, 280)])).rows[0];
    await postTxn(t, {
      type: 'HOLD', sessionId: s.id, memo: `Escrow for "${sk.title}"`,
      entries: [{ userId: learnerId, bucket: 'available', delta: -minutes }, { userId: learnerId, bucket: 'held', delta: minutes }],
    });
    return s.id;
  });
}

async function lockSession(t, id, userId) {
  const s = (await t.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!s || (s.mentor_id !== userId && s.learner_id !== userId)) throw notFound('Session not found');
  return s;
}

export async function confirmSession(userId, id) {
  return tx(async (t) => {
    const s = await lockSession(t, id, userId);
    if (s.status !== 'booked') throw conflict(`This session is already ${s.status}`);
    if (!cfg.demoMode && new Date() < new Date(s.start_at)) throw bad('You can confirm once the session has started');
    const col = s.mentor_id === userId ? 'mentor_confirmed_at' : 'learner_confirmed_at';
    await t.query(`UPDATE sessions SET ${col} = COALESCE(${col}, now()) WHERE id = $1`, [id]);
    const f = (await t.query('SELECT mentor_confirmed_at, learner_confirmed_at FROM sessions WHERE id = $1', [id])).rows[0];
    let released = false;
    if (f.mentor_confirmed_at && f.learner_confirmed_at) {
      // lock order: users first (same as booking), then ledger head inside postTxn
      for (const uid of [s.mentor_id, s.learner_id].sort((a, b) => a - b)) await t.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [uid]);
      await t.query(`UPDATE sessions SET status = 'completed', completed_at = now() WHERE id = $1`, [id]);
      await postTxn(t, {
        type: 'RELEASE', sessionId: id, memo: 'Both sides confirmed — escrow released',
        entries: [{ userId: s.learner_id, bucket: 'held', delta: -s.minutes }, { userId: s.mentor_id, bucket: 'available', delta: s.minutes }],
      });
      released = true;
    }
    return { released };
  });
}

export async function cancelSession(userId, id) {
  return tx(async (t) => {
    const s = await lockSession(t, id, userId);
    if (s.status !== 'booked') throw conflict(`This session is already ${s.status}`);
    if (new Date() >= new Date(s.start_at) && !cfg.demoMode) throw bad('Too late to cancel — the session has started. Confirm or contact your partner.');
    await t.query(`UPDATE sessions SET status = 'cancelled', cancelled_by = $2 WHERE id = $1`, [id, userId]);
    await postTxn(t, {
      type: 'REFUND', sessionId: id, memo: 'Session cancelled — escrow refunded',
      entries: [{ userId: s.learner_id, bucket: 'held', delta: -s.minutes }, { userId: s.learner_id, bucket: 'available', delta: s.minutes }],
    });
  });
}

export async function reviewSession(userId, id, { rating, comment = '' }) {
  return tx(async (t) => {
    const s = await lockSession(t, id, userId);
    if (s.learner_id !== userId) throw bad('Only the learner can rate the mentor');
    if (s.status !== 'completed') throw bad('You can rate a session after it is completed');
    const dup = (await t.query('SELECT 1 FROM reviews WHERE session_id = $1', [id])).rows;
    if (dup.length) throw conflict('You already rated this session');
    await t.query('INSERT INTO reviews (session_id, reviewer_id, mentor_id, rating, comment) VALUES ($1,$2,$3,$4,$5)', [id, userId, s.mentor_id, rating, String(comment).slice(0, 500)]);
    await t.query(
      `UPDATE users SET rating_avg = (SELECT AVG(rating)::float FROM reviews WHERE mentor_id = $1),
                        rating_count = (SELECT COUNT(*)::int FROM reviews WHERE mentor_id = $1) WHERE id = $1`, [s.mentor_id]);
  });
}

// ---- shared ledger moves (used by settlement and dispute resolution)
export async function releaseEscrow(t, s, memo) {
  for (const uid of [s.mentor_id, s.learner_id].sort((a, b) => a - b)) await t.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [uid]);
  await postTxn(t, { type: 'RELEASE', sessionId: s.id, memo,
    entries: [{ userId: s.learner_id, bucket: 'held', delta: -s.minutes }, { userId: s.mentor_id, bucket: 'available', delta: s.minutes }] });
}
export async function refundEscrow(t, s, memo) {
  await t.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [s.learner_id]);
  await postTxn(t, { type: 'REFUND', sessionId: s.id, memo,
    entries: [{ userId: s.learner_id, bucket: 'held', delta: -s.minutes }, { userId: s.learner_id, bucket: 'available', delta: s.minutes }] });
}

/** Learner reports a problem. Credits stay frozen in escrow until the two sides resolve it (or it times out into a refund). */
export async function disputeSession(userId, id) {
  return tx(async (t) => {
    const s = await lockSession(t, id, userId);
    if (s.learner_id !== userId) throw bad('Only the learner can report a problem');
    if (s.status !== 'booked') throw conflict(`This session is already ${s.status}`);
    if (s.learner_confirmed_at) throw bad('You already confirmed this session');
    if (!cfg.demoMode && new Date() < new Date(s.start_at)) throw bad('You can report a problem once the session has started');
    if (Date.now() > new Date(s.end_at).getTime() + cfg.autoReleaseHours * H) throw conflict('The reporting window has closed');
    await t.query(`UPDATE sessions SET status = 'disputed', disputed_by = $2, disputed_at = now() WHERE id = $1`, [id, userId]);
  });
}

/** Mentor agrees to refund, or learner withdraws the dispute and releases the credits. */
export async function resolveDispute(userId, id, outcome) {
  return tx(async (t) => {
    const s = await lockSession(t, id, userId);
    if (s.status !== 'disputed') throw conflict('There is no open dispute on this session');
    if (outcome === 'refund') {
      if (s.mentor_id !== userId) throw new HttpError(403, 'Only the mentor can agree to a refund');
      await t.query(`UPDATE sessions SET status = 'cancelled', resolution = 'dispute_refund' WHERE id = $1`, [id]);
      await refundEscrow(t, s, 'Dispute resolved — mentor agreed to refund');
    } else {
      if (s.learner_id !== userId) throw new HttpError(403, 'Only the learner can release the credits');
      await t.query(`UPDATE sessions SET status = 'completed', completed_at = now(), learner_confirmed_at = COALESCE(learner_confirmed_at, now()), resolution = 'dispute_withdrawn' WHERE id = $1`, [id]);
      await releaseEscrow(t, s, 'Dispute withdrawn — learner released the credits');
    }
  });
}

export async function listSessions(userId) {
  const { rows } = await query(`${SESSION_SELECT} WHERE se.mentor_id = $1 OR se.learner_id = $1 ORDER BY se.start_at DESC LIMIT 100`, [userId]);
  return rows.map((r) => shapeSession(r, userId));
}
