import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Logo, Coin, Button } from '../ui.jsx';

const STEPS = [
  ['Teach an hour', 'List what you know — Python, guitar, calculus, Figma. Set when you are free.', 'Earn 1 credit'],
  ['Learn an hour', 'Describe what you want in plain words. We rank mentors by fit, timing, trust and swap potential.', 'Spend 1 credit'],
  ['Everything is on the ledger', 'Credits sit in escrow until both of you confirm. Every movement is hash-chained and auditable.', 'Zero money'],
];

export default function Landing() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/stats').then(setStats).catch(() => {}); }, []);
  return (
    <div className="paper-grain min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex gap-2">
          <Link to="/auth?mode=login"><Button variant="ghost">Sign in</Button></Link>
          <Link to="/auth?mode=signup"><Button>Join with college email</Button></Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 md:grid-cols-[1.15fr_.85fr] md:pt-16">
        <div className="rise">
          <span className="mb-4 inline-block rounded-full border border-pine/20 bg-pine-soft px-3 py-1 text-sm font-semibold text-pine">Campus-only · no money involved</span>
          <h1 className="text-5xl font-bold leading-[1.03] text-ink sm:text-6xl">Your time is<br />the <span className="text-pine">currency</span>.</h1>
          <p className="mt-5 max-w-xl text-lg text-mute">
            Teach one hour, earn one credit. Spend it learning anything from a classmate. Paid tutoring is out of reach for most students — a peer who knows it is not.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/auth?mode=signup"><Button size="md" className="px-7 py-3 text-lg">Start with 3 free credits</Button></Link>
            <Link to="/auth?mode=login&demo=1"><Button variant="outline" className="px-6 py-3 text-lg">Try the demo account</Button></Link>
          </div>
          {stats && (
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[[stats.students, 'students'], [stats.hours, 'hours exchanged'], [stats.skills, 'skills offered']].map(([n, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd className="display text-3xl font-bold text-pine">{n}</dd><div className="text-sm text-mute">{l}</div></div>
              ))}
            </dl>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-4 -z-10 rotate-3 rounded-[2rem] bg-amber/20" />
          <div className="rise rounded-3xl border border-line bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-mute"><span>Passbook</span><Coin size={22} spin /></div>
            {[['GRANT', 'Welcome credits', '+3.0', 'text-pine'], ['HOLD', 'Escrow · Guitar Basics', '−1.0', 'text-clay'], ['RELEASE', 'Both confirmed', '→ Rohan', 'text-sky'], ['EARN', 'Taught Python', '+1.0', 'text-pine']].map(([t, m, a, c], i) => (
              <div key={i} className="flex items-center justify-between border-t border-dashed border-line py-2.5 font-mono text-[13px]">
                <div><div className="text-[10px] text-mute">{t}</div><div className="font-sans text-sm font-medium">{m}</div></div>
                <div className={`font-semibold ${c}`}>{a}</div>
              </div>
            ))}
            <div className="mt-2 rounded-xl bg-pine-soft px-3 py-2 font-mono text-[11px] text-pine">✓ chain verified · sha256 3f9a…c21e</div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-3">
          {STEPS.map(([h, p, tag], i) => (
            <div key={h} className="rounded-2xl border border-line bg-paper p-6">
              <div className="display mb-3 text-4xl font-bold text-amber">{i + 1}</div>
              <h3 className="text-xl font-bold">{h}</h3>
              <p className="mt-2 text-mute">{p}</p>
              <span className="mt-4 inline-block rounded-full bg-pine-soft px-3 py-1 text-xs font-bold text-pine">{tag}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold">Built so people can trust it</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Verified students only', 'Sign-up is limited to the college email domain and confirmed with a one-time code.'],
            ['Escrow, not promises', 'Credits are held when you book and released only when both sides confirm. Cancel and they come straight back.'],
            ['Tamper-evident ledger', 'Double-entry and hash-chained. Anyone can run the audit and see supply is conserved.'],
            ['Anti-abuse caps', 'A daily earn cap and double-booking prevention keep the economy fair.'],
          ].map(([h, p]) => <div key={h} className="rounded-2xl border border-line bg-card p-5"><h3 className="font-bold">{h}</h3><p className="mt-1.5 text-sm text-mute">{p}</p></div>)}
        </div>
      </section>
      <footer className="border-t border-line py-8 text-center text-sm text-mute">TimeBank · ECCLISIA 4.0 · Team Ionize</footer>
    </div>
  );
}
