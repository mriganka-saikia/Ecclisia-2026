import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, fmtTime, fmtRel, fmtH } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Chip, Avatar, Stars, MatchBar, ScoreRing, FACTORS, Spinner, Button } from '../ui.jsx';
import BookModal from './BookModal.jsx';
import DemandCard from './Demand.jsx';

const EXAMPLES = ['guitar basics tonight', 'help me with calculus this weekend', 'learn to design posters', 'python for beginners tomorrow evening', 'prepare for interviews'];

function ResultCard({ r, onBook }) {
  const [open, setOpen] = useState(false);
  const noSlots = !r.next_slot;
  return (
    <Card className="rise p-4 transition hover:shadow-md sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={r.mentor.name} size={46} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold leading-tight">{r.skill.title}</h3>
          <p className="truncate text-sm text-mute">{r.mentor.name} · {r.mentor.department}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Stars value={r.mentor.rating_avg} size={13} />
            <span className="font-mono text-xs text-mute">{r.mentor.rating_count ? `${r.mentor.rating_avg.toFixed(1)} (${r.mentor.rating_count})` : 'new'}</span>
            <Chip>{r.skill.category}</Chip>
            {r.skill.level !== 'all' && <Chip>{r.skill.level}</Chip>}
          </div>
        </div>
        <button onClick={() => setOpen(!open)} className="focus-ring rounded-full" aria-expanded={open} aria-label="Why this match?" title="Why this match?"><ScoreRing score={r.score} /></button>
      </div>
      {r.skill.description && <p className="mt-3 line-clamp-2 text-sm text-ink/80">{r.skill.description}</p>}
      <div className="mt-3"><MatchBar breakdown={r.breakdown} expanded={open} /></div>
      {r.reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.reasons.slice(0, open ? 9 : 3).map((t) => <Chip key={t} tone={t.includes('Wants to learn') ? 'clay' : t.startsWith('Free') ? 'pine' : t.startsWith('Not free') || t.startsWith('No open') || t.startsWith('No overlap') ? 'amber' : 'neutral'}>{t}</Chip>)}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-line pt-3">
        <div className="text-sm">{noSlots ? <span className="text-mute">No open slots this week</span> : <><span className="text-mute">Next: </span><b>{fmtDate(r.next_slot)} · {fmtTime(r.next_slot)}</b></>}</div>
        <Button size="sm" disabled={noSlots} onClick={() => onBook(r.skill.id)}>Book · 1 cr/h</Button>
      </div>
    </Card>
  );
}

function Rail() {
  const [feed, setFeed] = useState(null);
  const [lb, setLb] = useState([]);
  useEffect(() => { api('/ledger/feed').then(setFeed).catch(() => {}); api('/leaderboard').then(setLb).catch(() => {}); }, []);
  const line = (x) => ({ GRANT: `${x.who} received welcome credits`, HOLD: `${x.who} reserved credits`, RELEASE: `${x.from} → ${x.to}`, REFUND: `${x.who} was refunded` }[x.type]);
  return (
    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold">Top mentors</h2><Chip tone="amber">30 days</Chip></div>
        <ol className="space-y-2.5">
          {lb.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3"><span className="display w-5 text-center text-lg font-bold text-amber">{i + 1}</span><Avatar name={m.name} size={30} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{m.name}</div><div className="truncate text-xs text-mute">{m.department}</div></div><span className="font-mono text-sm font-medium">{fmtH(m.hours)}h</span></li>
          ))}
          {!lb.length && <li className="text-sm text-mute">Be the first on the board.</li>}
        </ol>
      </Card>
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold">Live ledger</h2><Link to="/wallet" className="text-xs font-semibold text-pine hover:underline">Audit →</Link></div>
        <ul className="space-y-2">
          {(feed || []).slice(0, 7).map((x) => (
            <li key={x.hash + x.seq} className="flex items-baseline justify-between gap-2 border-b border-dashed border-line pb-2 text-[13px] last:border-0">
              <span className="min-w-0 truncate">{line(x)}</span>
              <span className="shrink-0 font-mono text-xs text-mute">{x.type === 'HOLD' || x.type === 'REFUND' ? '' : '+'}{fmtH(x.hours)}h · {fmtRel(x.at)}</span>
            </li>
          ))}
          {!feed && <Spinner />}
        </ul>
      </Card>
      <DemandCard compact />
    </aside>
  );
}

export default function Discover() {
  const { user, meta } = useAuth();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState(null);
  const [ph, setPh] = useState(0);
  const seq = useRef(0);

  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % EXAMPLES.length), 3200); return () => clearInterval(t); }, []);
  const run = async () => {
    const id = ++seq.current; setLoading(true);
    try { const d = await api('/search', { method: 'POST', body: { q, category: cat } }); if (id === seq.current) setData(d); } finally { if (id === seq.current) setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(run, q ? 350 : 0); return () => clearTimeout(t); }, [q, cat]); // eslint-disable-line

  const it = data?.interpreted;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold sm:text-4xl">What do you want to learn, {user.name.split(' ')[0]}?</h1>
        <div className="relative mt-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="focus-ring w-full rounded-2xl border-2 border-pine/25 bg-white py-4 pl-5 pr-12 text-lg outline-none transition placeholder:text-mute/60 focus:border-pine" placeholder={`Try “${EXAMPLES[ph]}”`} aria-label="Describe what you want to learn" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl">✨</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.slice(0, 3).map((e) => <button key={e} onClick={() => setQ(e)} className="focus-ring rounded-full border border-line bg-card px-3 py-1 text-sm text-mute hover:border-pine hover:text-pine">{e}</button>)}
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Category">
          {['', ...(meta?.categories || [])].map((c) => (
            <button key={c || 'all'} onClick={() => setCat(c)} className={`focus-ring shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${cat === c ? 'border-pine bg-pine text-white' : 'border-line bg-card text-ink/70 hover:border-pine'}`}>{c || 'All'}</button>
          ))}
        </div>

        {it && (it.topic || it.when) && (
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
            <span className="text-mute">Understood:</span>
            {it.topic && <Chip tone="pine">topic · {it.topic}</Chip>}
            {it.when && <Chip tone="amber">when · {it.when}</Chip>}
            {it.level && <Chip>level · {it.level}</Chip>}
            <Chip tone={data.mode === 'semantic' ? 'pine' : 'neutral'}>{data.mode === 'semantic' ? '✨ AI semantic search' : 'keyword search'}</Chip>
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2" aria-busy={loading}>
          {data?.results.map((r) => <ResultCard key={r.skill.id} r={r} onBook={setBook} />)}
        </div>
        {loading && !data && <div className="mt-10 grid place-items-center"><Spinner /></div>}
        {data && !data.results.length && !loading && (
          <Card className="mt-6 p-8 text-center"><div className="display text-2xl font-bold">No mentors yet for that</div><p className="mt-1 text-mute">Try broader words — or be the first to teach it.</p><Link to="/teach"><Button className="mt-4">Offer this skill</Button></Link></Card>
        )}
        {data?.results.length > 0 && (
          <p className="mt-6 text-xs text-mute">Tap a score ring to see how it was calculated: {FACTORS.map((f) => `${f.label} ${Math.round((meta?.weights?.[f.key] || 0) * 100)}%`).join(' · ')}.</p>
        )}
      </div>
      <Rail />
      {book && <BookModal skillId={book} onClose={() => setBook(null)} onBooked={run} />}
    </div>
  );
}
