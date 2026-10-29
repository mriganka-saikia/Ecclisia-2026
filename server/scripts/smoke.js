// End-to-end API test on an in-memory database: `npm run smoke`
process.env.PGLITE_DIR = 'memory'; process.env.DATABASE_URL = process.env.SMOKE_DATABASE_URL || ''; process.env.DEMO_MODE = 'true';
process.env.LLM_API_KEY = ''; process.env.COLLEGE_EMAIL_DOMAIN = 'college.edu'; process.env.DAILY_EARN_CAP_HOURS = '4';

const { initDb, query } = await import('../src/db.js');
const { buildApp } = await import('../src/app.js');
const { seed } = await import('./seed.js');
const { verifyLedger } = await import('../src/lib/ledger.js');
const { subtract, intersect } = await import('../src/lib/intervals.js');
const { parseTimeIntent } = await import('../src/time.js');

await initDb();
const seeded = await seed();
const server = buildApp().listen(0);
const base = `http://localhost:${server.address().port}/api`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL', m)); if (c) console.log('  ok  ', m); };
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log('\nUnit checks');
ok(JSON.stringify(subtract([[0, 100]], [[20, 30], [50, 60]])) === '[[0,20],[30,50],[60,100]]', 'interval subtract');
ok(JSON.stringify(intersect([[0, 50]], [[40, 90]])) === '[[40,50]]', 'interval intersect');
const ti = parseTimeIntent('guitar basics tonight');
ok(ti.topic === 'guitar basics' && ti.label === 'tonight' && ti.windows.length === 1, 'NL time parser: "guitar basics tonight"');

console.log('\nAuth');
let r = await call('POST', '/auth/register', { name: 'Eve Outsider', email: 'eve@gmail.com', password: 'password123' });
ok(r.status === 403, 'non-college email rejected');
r = await call('POST', '/auth/register', { name: 'Test Learner', email: 'tester@college.edu', password: 'password123', department: 'CS' });
ok(r.status === 201 && r.body.devOtp, 'college email registers, OTP issued');
r = await call('POST', '/auth/login', { email: 'tester@college.edu', password: 'password123' });
ok(r.status === 403 && r.body.needsVerification, 'login blocked until verified');
const bad = await call('POST', '/auth/verify', { email: 'tester@college.edu', code: '000000' });
ok(bad.status === 400, 'wrong OTP rejected');
const otp = (await call('POST', '/auth/resend', { email: 'tester@college.edu' })).body.devOtp;
r = await call('POST', '/auth/verify', { email: 'tester@college.edu', code: otp });
ok(r.status === 200 && r.body.token, 'OTP verifies and signs in');
const T = r.body.token;
let w = (await call('GET', '/wallet', null, T)).body;
ok(w.available === 3, 'welcome credits: 3h in wallet');

console.log('\nSearch & matching');
await call('PUT', '/availability', { windows: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, start_min: 17 * 60, end_min: 22 * 60 })) }, T);
await call('POST', '/skills', { kind: 'offer', title: 'Python Programming', category: 'Programming', level: 'beginner' }, T);
r = await call('POST', '/search', { q: 'guitar basics tonight' }, T);
ok(r.body.results?.[0]?.skill.title.includes('Guitar'), `top result for "guitar basics tonight" is "${r.body.results?.[0]?.skill.title}" (mode: ${r.body.mode})`);
ok(r.body.interpreted.when === 'tonight', 'time intent detected');
const sumW = Object.values(r.body.results[0].breakdown).reduce((a, b) => a + b.points, 0);
ok(Math.abs(sumW - r.body.results[0].score) <= 1, 'score equals the sum of weighted factors');
r = await call('POST', '/search', { q: 'pyhton' }, T);
ok(r.body.results[0]?.skill.title.includes('Python'), 'typo tolerance: "pyhton" finds Python');
r = await call('POST', '/search', { q: 'I want to learn to design posters' }, T);
ok(r.body.results[0]?.skill.title.includes('Poster'), 'natural language: design posters');
r = await call('POST', '/search', { q: 'guitar' }, T);
ok(r.body.results[0].swap?.exact === true, 'reciprocity: guitar mentor wants Python, I teach Python');

console.log('\nCampus demand gap');
let dem = (await call('GET', '/demand', null, T)).body;
const photo = dem.gaps.find((g) => g.title === 'Photography Basics');
ok(photo && photo.wanters === 3 && photo.teachers === 0, 'unmet demand found: Photography Basics (3 students want it, nobody teaches it)');
ok(!dem.gaps.some((g) => /guitar|python/i.test(g.title)), 'skills that already have a teacher are not listed as gaps');
await call('POST', '/skills', { kind: 'offer', title: 'Photography Basics', category: 'Arts & Crafts', level: 'beginner', description: 'Composition, light and phone photography.' }, T);
dem = (await call('GET', '/demand', null, T)).body;
ok(!dem.gaps.some((g) => g.title === 'Photography Basics'), 'a gap closes as soon as someone offers to teach it');

console.log('\nBooking, escrow, double-booking');
const guitar = r.body.results[0];
const slots = (await call('GET', `/skills/${guitar.skill.id}/slots?minutes=60`, null, T)).body;
ok(slots.days.length > 0, 'slots returned for mentor');
const slot = slots.days[0].slots[0];
r = await call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: slot, minutes: 60 }, T);
ok(r.status === 201, 'session booked');
const sid = r.body.id;
w = (await call('GET', '/wallet', null, T)).body;
ok(w.available === 2 && w.held === 1, 'escrow: 1h moved from available to held');
r = await call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: slot, minutes: 60 }, T);
ok(r.status === 409 && r.body.code === 'DOUBLE_BOOKED', 'double-booking prevented');
const rohanTok = (await call('POST', '/auth/login', { email: 'aarav@college.edu', password: 'demo1234' })).body.token;
r = await call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: slot, minutes: 60 }, rohanTok);
ok(r.status === 409, 'a second student cannot take the same mentor slot');
r = await call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: new Date(Date.now() + 36e5 * 5.25).toISOString(), minutes: 60 }, T);
ok([409, 400].includes(r.status), 'booking outside availability / off-grid rejected');

console.log('\nConfirmation, release, earn cap, review');
r = await call('POST', `/sessions/${sid}/confirm`, null, T);
ok(r.status === 200 && !r.body.released, 'learner confirms: still in escrow');
const mentorLogin = (await call('POST', '/auth/login', { email: 'rohan@college.edu', password: 'demo1234' })).body;
const before = (await call('GET', '/wallet', null, mentorLogin.token)).body.available;
r = await call('POST', `/sessions/${sid}/confirm`, null, mentorLogin.token);
ok(r.body.released === true, 'mentor confirms: escrow released');
const after = (await call('GET', '/wallet', null, mentorLogin.token)).body.available;
ok(after === before + 1, 'mentor earned exactly 1 credit');
w = (await call('GET', '/wallet', null, T)).body;
ok(w.available === 2 && w.held === 0, 'learner spent 1 credit, nothing left in escrow');
r = await call('POST', `/sessions/${sid}/review`, { rating: 5, comment: 'Great!' }, T);
ok(r.status === 200 && r.body.reviewed, 'review saved');
r = await call('POST', `/sessions/${sid}/review`, { rating: 1 }, T);
ok(r.status === 409, 'cannot review twice');

// refund path
const slot2 = slots.days.at(-1).slots[0];
r = await call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: slot2, minutes: 60 }, T);
const sid2 = r.body.id;
r = await call('POST', `/sessions/${sid2}/cancel`, null, T);
w = (await call('GET', '/wallet', null, T)).body;
ok(r.body.status === 'cancelled' && w.available === 2 && w.held === 0, 'cancel refunds escrow in full');

// insufficient credits
const tmp = (await call('POST', '/auth/register', { name: 'Poor Student', email: 'poor@college.edu', password: 'password123' })).body.devOtp;
const T2 = (await call('POST', '/auth/verify', { email: 'poor@college.edu', code: tmp })).body.token;
const slots3 = (await call('GET', `/skills/${guitar.skill.id}/slots?minutes=120`, null, T2)).body;
const dayslots = slots3.days.find((d) => d.slots.length >= 1);
ok(!!dayslots, 'found a 2h slot to test caps');
r = await call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: dayslots.slots[0], minutes: 120 }, T2);
ok(r.status === 201, '3 credits can fund a 2h session');
const next = (await call('GET', `/skills/${guitar.skill.id}/slots?minutes=120`, null, T2)).body.days.flatMap((d) => d.slots)[0];
r = await call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: next, minutes: 120 }, T2);
ok(r.status === 402 && r.body.code === 'INSUFFICIENT_CREDITS', 'cannot spend credits you do not have (402)');

console.log('\nAuto-settlement and disputes');
const { settleOverdue } = await import('../src/services/settle.js');
const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 36e5).toISOString();
const movePast = (id, endedHoursAgo) => query('UPDATE sessions SET start_at = $2, end_at = $3 WHERE id = $1', [id, iso(endedHoursAgo + 1), iso(endedHoursAgo)]);
const bookNext = async (token) => {
  const days = (await call('GET', `/skills/${guitar.skill.id}/slots?minutes=60`, null, token)).body.days;
  return call('POST', '/sessions', { skill_id: guitar.skill.id, start_at: days[0].slots[0], minutes: 60 }, token);
};
const walletOf = async (token) => (await call('GET', '/wallet', null, token)).body;
const M = mentorLogin.token;

// a) one side confirmed, the other silent for 48h -> mentor is paid automatically
let sess = (await bookNext(T)).body;
ok(sess.auto_action === 'refund' && sess.can_dispute === true, 'a fresh booking shows what will happen if nobody acts (refund) and lets the learner dispute');
await call('POST', `/sessions/${sess.id}/confirm`, null, T);
const mentorBeforeA = (await walletOf(M)).available;
await movePast(sess.id, 49);
let res = await settleOverdue();
let got = (await call('GET', '/sessions', null, T)).body.find((x) => x.id === sess.id);
ok(res.released === 1 && got.status === 'completed' && got.resolution === 'auto_release', 'auto-release: learner confirmed, mentor silent for 49h, session completes');
ok((await walletOf(M)).available === mentorBeforeA + 1, 'auto-release paid the mentor exactly 1 credit');
ok((await walletOf(T)).held === 0, 'auto-release left nothing stuck in escrow');
res = await settleOverdue();
ok(res.released === 0 && res.refunded === 0, 'settling again does nothing (cannot pay twice)');

// b) nobody confirmed -> refund got 72h (and not before), triggered lazily by reading sessions
sess = (await bookNext(T)).body;
const availBeforeB = (await walletOf(T)).available + 1; // balance before this booking
await movePast(sess.id, 60);
got = (await call('GET', '/sessions', null, T)).body.find((x) => x.id === sess.id);
ok(got.status === 'booked', 'no auto-refund yet at 60h (window is 72h)');
await movePast(sess.id, 80);
got = (await call('GET', '/sessions', null, T)).body.find((x) => x.id === sess.id);
ok(got.status === 'cancelled' && got.resolution === 'auto_refund', 'auto-refund after 80h with no confirmation (settled just by opening the page)');
ok((await walletOf(T)).available === availBeforeB, 'auto-refund returned the credit to the learner');

// c) dispute: credits freeze, mentor agrees to refund
sess = (await bookNext(T)).body;
await call('POST', `/sessions/${sess.id}/confirm`, null, M);
r = await call('POST', `/sessions/${sess.id}/dispute`, null, M);
ok(r.status === 400, 'the mentor cannot raise a dispute');
r = await call('POST', `/sessions/${sess.id}/dispute`, null, T);
ok(r.status === 200 && r.body.status === 'disputed' && r.body.auto_action === 'refund', 'learner reports a problem: session becomes disputed');
ok((await walletOf(T)).held === 1, 'disputed credits stay frozen in escrow');
r = await call('POST', `/sessions/${sess.id}/confirm`, null, T);
ok(r.status === 409, 'a disputed session cannot be confirmed');
r = await call('POST', `/sessions/${sess.id}/resolve`, { outcome: 'refund' }, T);
ok(r.status === 403, 'the learner cannot force a refund on their own dispute');
const availBeforeC = (await walletOf(T)).available;
r = await call('POST', `/sessions/${sess.id}/resolve`, { outcome: 'refund' }, M);
ok(r.status === 200 && r.body.status === 'cancelled' && r.body.resolution === 'dispute_refund', 'mentor agrees: dispute ends in a refund');
ok((await walletOf(T)).available === availBeforeC + 1, 'learner got the credit back');

// d) learner withdraws the dispute and releases the credits
sess = (await bookNext(T)).body;
await call('POST', `/sessions/${sess.id}/confirm`, null, M);
await call('POST', `/sessions/${sess.id}/dispute`, null, T);
const mentorBeforeD = (await walletOf(M)).available;
r = await call('POST', `/sessions/${sess.id}/resolve`, { outcome: 'release' }, M);
ok(r.status === 403, 'the mentor cannot release credits on a disputed session');
r = await call('POST', `/sessions/${sess.id}/resolve`, { outcome: 'release' }, T);
ok(r.status === 200 && r.body.status === 'completed' && r.body.resolution === 'dispute_withdrawn', 'learner withdraws the dispute: session completes');
ok((await walletOf(M)).available === mentorBeforeD + 1, 'mentor is paid after the dispute is withdrawn');

// e) unresolved dispute for 7 days -> refund to the learner
sess = (await bookNext(T2)).body;
const availBeforeE = (await walletOf(T2)).available + 1;
await call('POST', `/sessions/${sess.id}/dispute`, null, T2);
await query('UPDATE sessions SET disputed_at = $2 WHERE id = $1', [sess.id, iso(8 * 24)]);
res = await settleOverdue();
got = (await call('GET', '/sessions', null, T2)).body.find((x) => x.id === sess.id);
ok(res.refunded === 1 && got.status === 'cancelled' && got.resolution === 'dispute_timeout', 'a dispute nobody resolves for 7 days refunds the learner');
ok((await walletOf(T2)).available === availBeforeE, 'the timed-out dispute returned the credit');

console.log('\nLedger integrity');
let v = await verifyLedger({ query });
ok(v.ok, `ledger verifies: ${v.entries} entries, ${v.transactions} txns, chain intact, supply conserved`);
await query(`UPDATE ledger SET delta = delta + 60 WHERE seq = 5`);
v = await verifyLedger({ query });
ok(!v.ok && v.problems.some((p) => /hash mismatch/.test(p)), `tampering with an old row is detected (${v.problems[0]})`);

console.log(`\n${pass} passed, ${fail} failed\n`);
server.close();
process.exit(fail ? 1 : 0);
