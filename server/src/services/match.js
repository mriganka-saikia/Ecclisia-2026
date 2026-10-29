import { query, inList } from '../db.js';
import { WEIGHTS } from '../config.js';
import { parseTimeIntent, toAbs, nextDays, DAY, fmtLocalTime } from '../time.js';
import { tokens, lexScore, detectLevel } from '../lib/text.js';
import { embed, embeddingsEnabled, cosine } from '../lib/embeddings.js';
import { freeIntervals, slotStarts, HORIZON_DAYS, LEAD_MIN } from './slots.js';
import { intersect, clip, total } from '../lib/intervals.js';

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Weighted match score (0-100):
 *   40% skill fit      hybrid of AI embedding similarity + lexical match (lexical only when AI is off)
 *   25% availability   mentor free time overlapping when you want it (parsed from the query / your own schedule)
 *   20% mentor rating  Bayesian-smoothed so brand-new mentors are not punished for having no reviews yet
 *   15% reciprocity    does the mentor want to learn something you can teach? (skill swap)
 */
export async function search({ me, q = '', category = '', limit = 24, now = new Date() }) {
  const intent = parseTimeIntent(q, now);
  const qTokens = tokens(intent.topic);
  const level = detectLevel(q);
  const nowAbs = toAbs(now) + LEAD_MIN;
  const hi = nextDays(HORIZON_DAYS, now).at(-1).dayStartAbs + DAY;

  const params = [me];
  let sql = `SELECT s.id, s.title, s.category, s.level, s.description, s.embedding, s.user_id,
                    u.name, u.department, u.year, u.rating_avg, u.rating_count
               FROM skills s JOIN users u ON u.id = s.user_id
              WHERE s.kind = 'offer' AND s.active AND u.verified AND s.user_id <> $1`;
  if (category) { params.push(category); sql += ` AND s.category = $${params.length}`; }
  const cands = (await query(sql, params)).rows;
  if (!cands.length) return { mode: 'keyword', interpreted: { topic: intent.topic, when: intent.label, level }, results: [] };

  const mentorIds = [...new Set(cands.map((c) => c.user_id))];
  const [free, taught, wants, mine, myAv] = await Promise.all([
    freeIntervals(mentorIds, { now, viewerId: me }),
    query(`SELECT mentor_id, COALESCE(SUM(minutes),0)::int AS m, COUNT(*)::int AS n FROM sessions WHERE status='completed' AND mentor_id IN (${inList(mentorIds)}) GROUP BY mentor_id`, mentorIds),
    query(`SELECT user_id, title, category FROM skills WHERE kind='want' AND active AND user_id IN (${inList(mentorIds)})`, mentorIds),
    query(`SELECT title, category FROM skills WHERE kind='offer' AND active AND user_id = $1`, [me]),
    query(`SELECT weekday, start_min, end_min FROM availability WHERE user_id = $1`, [me]),
  ]);

  // ---- desired time windows: what the person typed > their own weekly availability > none
  let desired = null, desiredSource = null;
  if (intent.windows) { desired = clip(intent.windows, nowAbs, hi); desiredSource = 'query'; }
  else if (myAv.rows.length) {
    desired = [];
    for (const d of nextDays(HORIZON_DAYS, now)) for (const r of myAv.rows.filter((r) => r.weekday === d.weekday)) desired.push([d.dayStartAbs + r.start_min, d.dayStartAbs + r.end_min]);
    desired = clip(desired, nowAbs, hi); desiredSource = 'schedule';
  }

  // ---- skill fit
  const qvec = qTokens.length && embeddingsEnabled() ? await embed(intent.topic, 'query') : null;
  const sims = cands.map((c) => (qvec && c.embedding ? cosine(qvec, c.embedding) : null));
  const maxSim = Math.max(-1, ...sims.filter((x) => x !== null));
  const semantic = qvec && sims.some((x) => x !== null);

  const taughtBy = new Map(taught.rows.map((r) => [r.mentor_id, r]));
  const out = cands.map((c, i) => {
    const lex = qTokens.length ? lexScore(qTokens, c) : 1;
    let fit = lex;
    if (qTokens.length && semantic && sims[i] !== null) fit = 0.7 * clamp(1 - (maxSim - sims[i]) / 0.2) + 0.3 * lex;
    if (level && qTokens.length) fit = c.level === level || c.level === 'all' ? Math.min(1, fit + 0.08) : fit * 0.85;

    const f = free.get(c.user_id) || [];
    const freeMin = total(f);
    let avail, overlap = null, pool = f;
    if (desired) {
      pool = intersect(f, desired);
      overlap = total(pool);
      avail = clamp(overlap / (desiredSource === 'query' ? 120 : 180));
    } else avail = clamp(freeMin / 300);
    const firstStart = slotStarts(pool.length ? pool : f, 60)[0] ?? slotStarts(f, 30)[0] ?? null;

    const n = c.rating_count;
    const smooth = (c.rating_avg * n + 3.5 * 3) / (n + 3);
    const rating = clamp(smooth / 5);

    // reciprocity: does this mentor want something I can teach?
    let recip = 0, swap = null;
    for (const w of wants.rows.filter((w) => w.user_id === c.user_id)) {
      for (const o of mine.rows) {
        const sim = lexScore(tokens(w.title), { title: o.title, category: o.category, description: '' });
        const v = sim >= 0.6 ? 1 : w.category === o.category ? 0.5 : 0;
        if (v > recip) { recip = v; swap = { wants: w.title, youOffer: o.title, exact: v === 1 }; }
      }
    }

    const parts = { fit, availability: avail, rating, reciprocity: recip };
    const score = Math.round(100 * Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0));
    const t = taughtBy.get(c.user_id);

    const reasons = [];
    if (qTokens.length && fit >= 0.6) reasons.push(semantic ? 'Strong match for what you described' : 'Title/keywords match your search');
    if (desired && overlap > 0) reasons.push(desiredSource === 'query' ? `Free ${intent.label}` : 'Free when you are free');
    else if (desired && overlap === 0) reasons.push(desiredSource === 'query' ? `Not free ${intent.label} — next opening shown` : 'No overlap with your schedule this week');
    if (n >= 3) reasons.push(`${c.rating_avg.toFixed(1)}★ from ${n} sessions`);
    if (swap) reasons.push(swap.exact ? `Wants to learn ${swap.wants} — you teach it` : `Interested in ${swap.wants}`);
    if (!f.length) reasons.push('No open slots in the next 7 days');

    return {
      skill: { id: c.id, title: c.title, category: c.category, level: c.level, description: c.description },
      mentor: { id: c.user_id, name: c.name, department: c.department, year: c.year, rating_avg: r2(c.rating_avg), rating_count: n, hours_taught: r2((t?.m || 0) / 60) },
      score,
      breakdown: Object.fromEntries(Object.entries(WEIGHTS).map(([k, w]) => [k, { value: r2(parts[k]), weight: w, points: r2(w * parts[k] * 100) }])),
      next_slot: firstStart === null ? null : new Date(firstStart * 60_000).toISOString(),
      next_slot_label: firstStart === null ? null : fmtLocalTime(firstStart),
      free_minutes_week: freeMin,
      swap, reasons, _fit: fit,
    };
  });

  let results = out;
  if (qTokens.length) {
    const good = out.filter((r) => r._fit >= 0.25);
    results = good.length >= 3 ? good : [...out].sort((a, b) => b._fit - a._fit).slice(0, 5);
  }
  results.sort((a, b) => b.score - a.score || b.mentor.rating_avg - a.mentor.rating_avg);
  results.forEach((r) => delete r._fit);
  return {
    mode: semantic ? 'semantic' : 'keyword',
    interpreted: { topic: intent.topic, when: intent.label, level, timeSource: desiredSource },
    results: results.slice(0, limit),
  };
}
