// Calendar export for a booked session. Pure functions (no React, no DOM) so they can be unit-tested in Node.
const pad = (n) => String(n).padStart(2, '0');

/** 20261029T133000Z */
export const icsStamp = (d) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}${pad(x.getUTCSeconds())}Z`;
};

// RFC 5545 text escaping
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets must be folded: CRLF + one space. We fold conservatively at 60 characters.
const fold = (line) => {
  if (line.length <= 60) return line;
  const parts = [line.slice(0, 60)];
  for (let i = 60; i < line.length; i += 59) parts.push(line.slice(i, i + 59));
  return parts.join('\r\n ');
};

const details = (s) => {
  const other = s.role === 'mentor' ? s.learner.name : s.mentor.name;
  const lines = [
    s.role === 'mentor' ? `You are teaching ${s.skill_title} to ${other}.` : `You are learning ${s.skill_title} from ${other}.`,
    s.meet_url ? `Video room: ${s.meet_url}` : '',
    s.role === 'mentor' ? `You earn ${s.credits} credit once you both confirm.` : `${s.credits} credit is held in escrow until you both confirm.`,
    'Booked with TimeBank.',
  ];
  return lines.filter(Boolean).join('\n');
};

const title = (s) => `TimeBank: ${s.skill_title} (${s.role === 'mentor' ? 'teaching' : 'learning'} with ${s.role === 'mentor' ? s.learner.name : s.mentor.name})`;

export function buildIcs(s, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimeBank//Campus Skill Exchange//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:timebank-session-${s.id}@timebank`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(s.start_at)}`,
    `DTEND:${icsStamp(s.end_at)}`,
    `SUMMARY:${esc(title(s))}`,
    `DESCRIPTION:${esc(details(s))}`,
    ...(s.meet_url ? [`LOCATION:${esc(s.meet_url)}`, `URL:${s.meet_url}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:TimeBank session starts in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const googleCalendarUrl = (s) =>
  'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE', text: title(s), dates: `${icsStamp(s.start_at)}/${icsStamp(s.end_at)}`,
    details: details(s), location: s.meet_url || '',
  }).toString();

/** Browser only: triggers a .ics file download. */
export function downloadIcs(s) {
  const blob = new Blob([buildIcs(s)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timebank-session-${s.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
