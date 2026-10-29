import { cfg } from './config.js';

const MIN = 60_000;
export const DAY = 1440;
const off = () => cfg.tzOffsetMin;

// Campus-local helpers. Campus time is a fixed UTC offset (IST has no DST).
export const localParts = (d) => {
  const l = new Date(d.getTime() + off() * MIN);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), weekday: l.getUTCDay(), minutes: l.getUTCHours() * 60 + l.getUTCMinutes() };
};
export const dateKey = (d) => {
  const p = localParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};
// Absolute minute (since epoch) for a local calendar day + local minutes-of-day
export const localToAbs = (key, minutes) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MIN + minutes - off();
};
export const absToDate = (abs) => new Date(abs * MIN);
export const toAbs = (d) => Math.floor(d.getTime() / MIN);
export const dayRangeUtc = (key) => [absToDate(localToAbs(key, 0)), absToDate(localToAbs(key, DAY))];

// The next `n` campus-local calendar days starting today
export const nextDays = (n, from = new Date()) => {
  const out = [];
  const base = localToAbs(dateKey(from), 0);
  for (let i = 0; i < n; i++) {
    const abs = base + i * DAY;
    const dt = absToDate(abs);
    out.push({ key: dateKey(dt), weekday: localParts(dt).weekday, dayStartAbs: abs });
  }
  return out;
};

export const fmtLocalTime = (abs) => {
  const m = ((abs + off()) % DAY + DAY) % DAY;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

// ---- Natural-language time intent: "guitar basics tonight" -> { topic: "guitar basics", label: "tonight", windows }
const PARTS = {
  morning: [8 * 60, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 22 * 60],
  night: [19 * 60, 23 * 60 + 30], tonight: [18 * 60, 23 * 60 + 30],
};
const WD = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };

export function parseTimeIntent(q, now = new Date()) {
  let s = ` ${q.toLowerCase()} `;
  const found = [];
  const take = (re, tag) => { if (re.test(s)) { s = s.replace(re, ' '); found.push(tag); return true; } return false; };

  let dayRule = null, part = null;
  if (take(/\b(right now|asap|immediately)\b/, 'now')) dayRule = 'now';
  if (take(/\btonight\b/, 'tonight')) { dayRule = 'today'; part = 'tonight'; }
  if (take(/\btoday\b/, 'today')) dayRule = 'today';
  if (take(/\btomorrow\b/, 'tomorrow')) dayRule = 'tomorrow';
  if (take(/\b(this )?weekend\b/, 'this weekend')) dayRule = 'weekend';
  const wds = [];
  for (const [name, idx] of Object.entries(WD)) if (new RegExp(`\\b(on |this |next )?${name}\\b`).test(s)) { s = s.replace(new RegExp(`\\b(on |this |next )?${name}\\b`), ' '); wds.push(idx); }
  if (wds.length) { dayRule = 'weekdays'; found.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wds[0]]); }
  for (const p of ['morning', 'afternoon', 'evening', 'night']) if (!part && take(new RegExp(`\\b(in the |this )?${p}\\b`), p)) part = p;
  take(/\bthis week\b/, 'this week');

  const topic = s.replace(/\s+/g, ' ').trim();
  if (!dayRule && !part) return { topic, label: null, windows: null };

  const days = nextDays(7, now);
  const [ps, pe] = part ? PARTS[part] : [8 * 60, 23 * 60 + 30];
  const nowAbs = toAbs(now);
  const windows = [];
  for (const d of days) {
    const ok =
      dayRule === 'now' ? d.key === days[0].key :
      dayRule === 'today' ? d.key === days[0].key :
      dayRule === 'tomorrow' ? d.key === days[1].key :
      dayRule === 'weekend' ? d.weekday === 0 || d.weekday === 6 :
      dayRule === 'weekdays' ? wds.includes(d.weekday) : true;
    if (!ok) continue;
    let a = d.dayStartAbs + ps, b = d.dayStartAbs + pe;
    if (dayRule === 'now') { a = nowAbs; b = nowAbs + 180; }
    windows.push([a, b]);
  }
  return { topic, label: found.join(' · '), windows };
}
