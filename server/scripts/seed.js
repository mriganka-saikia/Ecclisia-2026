import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { initDb, query, tx } from '../src/db.js';
import { cfg } from '../src/config.js';
import { postTxn, balances } from '../src/lib/ledger.js';
import { backfillEmbeddings } from '../src/lib/embeddings.js';
import { nextDays, localToAbs, absToDate } from '../src/time.js';

const H = 3600_000;
const WK = [1, 2, 3, 4, 5], WE = [0, 6], ALL = [0, 1, 2, 3, 4, 5, 6];
// [name, dept, year, bio, offers[[title,cat,level,desc]], wants[[title,cat]], availability [days, startH, endH][]]
const PEOPLE = [
  ['Riya Kapoor', 'Computer Science', '2nd year', 'Demo account — learning guitar, happy to teach Python.', [['Python Programming', 'Programming', 'beginner', 'Variables to functions to small projects. Great for first-years and non-CS majors.']], [['Guitar Basics', 'Music']], [[ALL, 17, 20]]],
  ['Aarav Sharma', 'Computer Science', '3rd year', 'Placement-season survivor. I like explaining recursion with pizza.', [['Data Structures & Algorithms', 'Programming', 'intermediate', 'Arrays to graphs with interview-style problems, in Python or C++.'], ['Python Programming', 'Programming', 'beginner', 'Beginner-friendly Python with hands-on exercises.']], [['Guitar Basics', 'Music']], [[WK, 18, 21], [WE, 10, 14]]],
  ['Meera Iyer', 'Design', '3rd year', 'UI/UX intern, Figma nerd.', [['Figma & UI Design', 'Design', 'all', 'Frames, auto-layout, components and building a clickable prototype.'], ['Poster & Social Media Design', 'Design', 'beginner', 'Layout, colour and typography for club posters and fest creatives.']], [['Python Programming', 'Programming']], [[ALL, 18, 21]]],
  ['Rohan Mehta', 'Mechanical', '2nd year', 'Plays in the college band. Guitar since I was 12.', [['Guitar Basics', 'Music', 'beginner', 'Open chords, strumming patterns and your first full song. Acoustic or electric.'], ['Music Theory Made Easy', 'Music', 'all', 'Scales, chords and ear training without the headache.']], [['Python Programming', 'Programming']], [[ALL, 19, 22]]],
  ['Sana Khan', 'Electronics', '4th year', 'Maths tutor to half my hostel floor.', [['Calculus & Linear Algebra', 'Academics', 'all', 'Exam-focused help: limits, integrals, matrices, eigenvalues.'], ['Circuit Analysis', 'Academics', 'intermediate', 'KVL/KCL, Thevenin, transient analysis with worked examples.']], [['Spanish for Beginners', 'Languages']], [[WK, 17, 20]]],
  ['Kabir Singh', 'Computer Science', '4th year', 'Full-stack dev, hackathon regular.', [['React & Web Development', 'Programming', 'intermediate', 'Build and deploy a React app: components, state, routing, APIs.'], ['Git & GitHub Workflow', 'Programming', 'beginner', 'Branches, pull requests and not breaking the main branch.']], [['Spoken English & Public Speaking', 'Languages']], [[WK, 19, 22], [WE, 11, 16]]],
  ['Ananya Rao', 'English Literature', '3rd year', 'Debate society captain.', [['Spoken English & Public Speaking', 'Languages', 'all', 'Confidence, structure and delivery for presentations, GDs and interviews.'], ['Resume & Cover Letter Review', 'Career', 'all', 'Turn your experience into a one-page resume recruiters actually read.']], [['Figma & UI Design', 'Design']], [[ALL, 16, 19]]],
  ['Dev Patel', 'Mechanical', '3rd year', 'CAD and spreadsheets are my love language.', [['CAD with SolidWorks', 'Design', 'beginner', 'Sketches, parts, assemblies and drawings.'], ['Excel & Data Analysis', 'Academics', 'all', 'Formulas, pivot tables and charts that impress your professor.']], [['Guitar Basics', 'Music']], [[WK, 18, 20]]],
  ['Isha Nair', 'Psychology', '2nd year', 'Spent a semester in Madrid. Yoga on weekends.', [['Spanish for Beginners', 'Languages', 'beginner', 'Greetings to everyday conversation. Conversation-first, grammar second.'], ['Yoga & Stretching', 'Fitness', 'beginner', 'Gentle flows for desk-hunched students.']], [['Python Programming', 'Programming']], [[WE, 8, 12], [WK, 17, 19]]],
  ['Vikram Joshi', 'Computer Science', '4th year', 'ML research assistant.', [['Machine Learning Basics', 'Programming', 'intermediate', 'Regression to neural nets with scikit-learn and PyTorch, hands-on.'], ['Competitive Programming', 'Programming', 'advanced', 'Codeforces-style problem solving: DP, graphs, number theory.']], [['Figma & UI Design', 'Design']], [[WK, 20, 23]]],
  ['Neha Gupta', 'Architecture', '2nd year', 'Sketchbook always open.', [['French for Beginners', 'Languages', 'beginner', 'Pronunciation, everyday phrases and basic grammar.'], ['Sketching & Watercolours', 'Arts & Crafts', 'beginner', 'Perspective, shading and loose watercolour washes.']], [['React & Web Development', 'Programming']], [[ALL, 15, 18]]],
  ['Tanvi Desai', 'Music', '3rd year', 'Trained pianist, loves teaching kids and adults alike.', [['Piano for Beginners', 'Music', 'beginner', 'Reading notes, hand position and your first pieces.'], ['Singing & Vocal Warm-ups', 'Music', 'all', 'Breath control, pitch and warming up safely.']], [['Calculus & Linear Algebra', 'Academics']], [[WK, 16, 19], [WE, 10, 13]]],
  ['Arjun Reddy', 'Management', '4th year', 'Placed at a consulting firm. Mock interviews are my thing.', [['Interview Prep & Aptitude', 'Career', 'all', 'Mock HR/technical interviews, case basics and quant aptitude tricks.']], [['Guitar Basics', 'Music']], [[WK, 18, 21]]],
];
const COMMENTS = ['Super clear explanations — learned more in an hour than in a week.', 'Patient, well prepared and fun. Booking again!', 'Great session, lots of practical examples.', 'Really helpful, especially the exercises at the end.', 'Friendly and encouraging. Highly recommend.', 'Exactly what I needed before my exam.'];
const rnd = (n) => Math.floor(Math.random() * n);

export async function seed({ reset = false } = {}) {
  await initDb();
  const have = (await query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;
  if (have && !reset) return { skipped: true };
  if (reset) {
    await query('TRUNCATE reviews, ledger, sessions, availability, skills, users RESTART IDENTITY CASCADE');
    await query(`UPDATE ledger_head SET seq = 0, hash = 'GENESIS' WHERE id = 1`);
  }
  const domain = cfg.domains[0];
  const pw = await bcrypt.hash('demo1234', 10);
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * H);
  const ids = [], skills = new Map(), people = [];

  await tx(async (t) => {
    for (const [i, p] of PEOPLE.entries()) {
      const [name, dept, year, bio, offers, wants, avail] = p;
      const email = `${name.split(' ')[0].toLowerCase()}@${domain}`;
      const u = (await t.query(`INSERT INTO users (email, name, password_hash, department, year, bio, verified) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`, [email, name, pw, dept, year, bio])).rows[0];
      ids.push(u.id); people.push({ id: u.id, name, email });
      skills.set(u.id, []);
      for (const [title, cat, lvl, desc] of offers) {
        const s = (await t.query(`INSERT INTO skills (user_id, kind, title, category, level, description) VALUES ($1,'offer',$2,$3,$4,$5) RETURNING id`, [u.id, title, cat, lvl, desc])).rows[0];
        skills.get(u.id).push({ id: s.id, title });
      }
      for (const [title, cat] of wants) await t.query(`INSERT INTO skills (user_id, kind, title, category) VALUES ($1,'want',$2,$3)`, [u.id, title, cat]);
      for (const [days, a, b] of avail) for (const d of days) await t.query('INSERT INTO availability (user_id, weekday, start_min, end_min) VALUES ($1,$2,$3,$4)', [u.id, d, a * 60, b * 60]);
      await postTxn(t, { type: 'GRANT', memo: 'Welcome credits', at: new Date(monthAgo.getTime() + i * 60_000), entries: [{ userId: null, bucket: 'mint', delta: -cfg.welcomeMin }, { userId: u.id, bucket: 'available', delta: cfg.welcomeMin }] });
    }

    // ---- a month of believable history: completed sessions with escrow + release + reviews
    const bal = new Map(ids.map((id) => [id, cfg.welcomeMin]));
    const events = [];
    for (let k = 0; k < 26; k++) events.push(new Date(monthAgo.getTime() + (k + 1) * 26 * H + rnd(5) * H));
    for (const when of events) {
      const learner = ids[rnd(ids.length)];
      const mentor = ids.filter((x) => x !== learner)[rnd(ids.length - 1)];
      const minutes = [30, 60, 60, 90][rnd(4)];
      if (bal.get(learner) < minutes) continue;
      const sk = skills.get(mentor)[rnd(skills.get(mentor).length)];
      const end = new Date(when.getTime() + minutes * 60_000);
      const s = (await t.query(
        `INSERT INTO sessions (skill_id, mentor_id, learner_id, start_at, end_at, minutes, status, mentor_confirmed_at, learner_confirmed_at, completed_at, meet_url)
         VALUES ($1,$2,$3,$4,$5,$6,'completed',$5,$5,$5,$7) RETURNING id`,
        [sk.id, mentor, learner, when.toISOString(), end.toISOString(), minutes, `https://meet.jit.si/timebank-seed${rnd(99999)}`])).rows[0];
      await postTxn(t, { type: 'HOLD', sessionId: s.id, memo: `Escrow for "${sk.title}"`, at: new Date(when.getTime() - 2 * H), entries: [{ userId: learner, bucket: 'available', delta: -minutes }, { userId: learner, bucket: 'held', delta: minutes }] });
      await postTxn(t, { type: 'RELEASE', sessionId: s.id, memo: 'Both sides confirmed — escrow released', at: end, entries: [{ userId: learner, bucket: 'held', delta: -minutes }, { userId: mentor, bucket: 'available', delta: minutes }] });
      bal.set(learner, bal.get(learner) - minutes); bal.set(mentor, bal.get(mentor) + minutes);
      if (Math.random() < 0.85) await t.query('INSERT INTO reviews (session_id, reviewer_id, mentor_id, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [s.id, learner, mentor, Math.random() < 0.7 ? 5 : 4, COMMENTS[rnd(COMMENTS.length)], end.toISOString()]);
    }
    await t.query(`UPDATE users SET rating_avg = COALESCE((SELECT AVG(rating)::float FROM reviews WHERE mentor_id = users.id), 0), rating_count = (SELECT COUNT(*)::int FROM reviews WHERE mentor_id = users.id)`);

    // ---- one upcoming session for the demo account (Riya learns Figma from Meera tomorrow at 7 PM)
    const riya = ids[0], meera = ids[2];
    const tomorrow = nextDays(2, now)[1];
    const start = absToDate(localToAbs(tomorrow.key, 19 * 60));
    const sk = skills.get(meera)[0];
    const s = (await t.query(`INSERT INTO sessions (skill_id, mentor_id, learner_id, start_at, end_at, minutes, meet_url, note) VALUES ($1,$2,$3,$4,$5,60,$6,'Keen to learn auto-layout!') RETURNING id`,
      [sk.id, meera, riya, start.toISOString(), new Date(start.getTime() + H).toISOString(), 'https://meet.jit.si/timebank-demo-figma'])).rows[0];
    await postTxn(t, { type: 'HOLD', sessionId: s.id, memo: `Escrow for "${sk.title}"`, entries: [{ userId: riya, bucket: 'available', delta: -60 }, { userId: riya, bucket: 'held', delta: 60 }] });
  });

  await backfillEmbeddings().catch(() => {});
  return { users: people, domain, balanceRiya: (await balances({ query }, ids[0])) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = await seed({ reset: process.argv.includes('--reset') });
  if (out.skipped) console.log('Database already has data. Use `npm run seed -- --reset` to wipe and reseed.');
  else console.log(`Seeded ${out.users.length} students. Sign in with  riya@${out.domain} / demo1234  (all seeded users share that password)`);
  process.exit(0);
}
