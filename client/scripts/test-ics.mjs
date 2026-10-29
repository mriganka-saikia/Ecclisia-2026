// Unit checks for the calendar export: `npm test` (inside /client)
import assert from 'node:assert/strict';
import { buildIcs, icsStamp, googleCalendarUrl } from '../src/ics.js';

const session = {
  id: 42, role: 'learner', skill_title: 'Guitar Basics, for beginners; chords', credits: 1,
  start_at: '2026-10-30T13:30:00.000Z', end_at: '2026-10-30T14:30:00.000Z',
  meet_url: 'https://meet.jit.si/timebank-abc123', mentor: { id: 2, name: 'Rohan Mehta' }, learner: { id: 1, name: 'Riya Kapoor' },
};
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ', name); };

t('timestamp is UTC basic format', () => assert.equal(icsStamp('2026-10-30T13:30:00.000Z'), '20261030T133000Z'));
const ics = buildIcs(session, new Date('2026-10-29T08:00:00Z'));
t('valid calendar envelope', () => { assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n')); assert.ok(ics.endsWith('END:VCALENDAR\r\n')); });
t('uses CRLF line endings only', () => assert.ok(!/[^\r]\n/.test(ics)));
t('correct start, end and stable UID', () => {
  assert.ok(ics.includes('DTSTART:20261030T133000Z'));
  assert.ok(ics.includes('DTEND:20261030T143000Z'));
  assert.ok(ics.includes('UID:timebank-session-42@timebank'));
});
t('commas and semicolons are escaped', () => assert.ok(ics.replace(/\r\n /g, '').includes('Guitar Basics\\, for beginners\\; chords')));
t('video link included', () => assert.ok(ics.replace(/\r\n /g, '').includes('LOCATION:https://meet.jit.si/timebank-abc123')));
t('15-minute reminder present', () => assert.ok(ics.includes('TRIGGER:-PT15M')));
t('no line exceeds 75 characters', () => assert.ok(ics.split('\r\n').every((l) => l.length <= 75)));
t('mentor sees a teaching title', () => assert.ok(buildIcs({ ...session, role: 'mentor' }).replace(/\r\n /g, '').includes('teaching with Riya Kapoor')));
t('Google Calendar link has the dates', () => assert.ok(googleCalendarUrl(session).includes('dates=20261030T133000Z%2F20261030T143000Z')));
console.log(`\n${n} passed\n`);
