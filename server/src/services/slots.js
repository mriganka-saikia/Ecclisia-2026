import { query, inList } from '../db.js';
import { cfg } from '../config.js';
import { nextDays, toAbs, absToDate, dateKey, DAY } from '../time.js';
import { subtract, clip, total } from '../lib/intervals.js';

export const LEAD_MIN = 30;
export const HORIZON_DAYS = 7;


export async function freeIntervals(mentorIds, { now = new Date(), viewerId = null } = {}) {
  const out = new Map();
  if (!mentorIds.length) return out;
  const days = nextDays(HORIZON_DAYS, now);
  const lo = toAbs(now) + LEAD_MIN;
  const hi = days[days.length - 1].dayStartAbs + DAY;
  const dayStart = absToDate(days[0].dayStartAbs);

  const av = await query(`SELECT user_id, weekday, start_min, end_min FROM availability WHERE user_id IN (${inList(mentorIds)})`, mentorIds);
  const ids = viewerId ? [...new Set([...mentorIds, viewerId])] : mentorIds;
  const ss = await query(
    `SELECT mentor_id, learner_id, start_at, minutes, status FROM sessions
      WHERE status IN ('booked','completed') AND start_at >= $1
        AND (mentor_id IN (${inList(ids, 1)}) OR learner_id IN (${inList(ids, 1)}))`,
    [dayStart.toISOString(), ...ids],
  );

  const busyOf = (uid) => ss.rows.filter((s) => s.status === 'booked' && (s.mentor_id === uid || s.learner_id === uid))
    .map((s) => [toAbs(new Date(s.start_at)), toAbs(new Date(s.start_at)) + s.minutes]);
  const viewerBusy = viewerId ? busyOf(viewerId) : [];

  for (const mid of mentorIds) {
    let base = [];
    const rows = av.rows.filter((r) => r.user_id === mid);
    for (const d of days) {
      
      const used = ss.rows.filter((s) => s.mentor_id === mid && dateKey(new Date(s.start_at)) === d.key).reduce((n, s) => n + s.minutes, 0);
      if (used >= cfg.dailyCapMin) continue;
      for (const r of rows.filter((r) => r.weekday === d.weekday)) base.push([d.dayStartAbs + r.start_min, d.dayStartAbs + r.end_min]);
    }
    base = clip(base, lo, hi);
    out.set(mid, subtract(base, [...busyOf(mid), ...viewerBusy]));
  }
  return out;
}

export function slotStarts(free, minutes) {
  const starts = [];
  const grid = 30, off = cfg.tzOffsetMin;
  for (const [a, b] of free) {
    let s = Math.ceil((a + off) / grid) * grid - off;
    for (; s + minutes <= b; s += grid) starts.push(s);
  }
  return starts;
}

export const freeTotal = total;
