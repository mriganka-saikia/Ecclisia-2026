import { useEffect, useState } from 'react';
import { api, fmtH, fmtDate, fmtTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Coin, Button, Chip, Spinner } from '../ui.jsx';

const TYPE = {
  GRANT: { label: 'Welcome grant', tone: 'text-pine' },
  HOLD: { label: 'Escrow hold', tone: 'text-clay' },
  RELEASE: { label: 'Released', tone: 'text-sky' },
  REFUND: { label: 'Refunded', tone: 'text-pine' },
};

function Spark({ points }) {
  if (points.length < 2) return null;
  const w = 260, h = 56, max = Math.max(...points, 1), min = Math.min(...points, 0);
  const xy = points.map((v, i) => [(i / (points.length - 1)) * w, h - 6 - ((v - min) / (max - min || 1)) * (h - 12)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Balance over time">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="rgba(255,255,255,.12)" />
      <path d={d} fill="none" stroke="#f2a33a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy.at(-1)[0]} cy={xy.at(-1)[1]} r="4" fill="#f2a33a" />
    </svg>
  );
}

export default function Wallet() {
  const { meta } = useAuth();
  const [w, setW] = useState(null);
  const [audit, setAudit] = useState(null);
  const [auditing, setAuditing] = useState(false);
  useEffect(() => { api('/wallet').then(setW); }, []);

  const runAudit = async () => {
    setAuditing(true); setAudit(null);
    const [res] = await Promise.all([api('/ledger/verify'), new Promise((r) => setTimeout(r, 900))]);
    setAudit(res); setAuditing(false);
  };
  if (!w) return <div className="grid place-items-center py-20"><Spinner /></div>;

  const cap = w.earn_cap;
  const series = [...w.history].reverse().map((h) => h.total_after / 60);
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Wallet & ledger</h1>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="relative overflow-hidden rounded-3xl bg-pine p-6 text-white shadow-xl sm:p-8">
          <div className="absolute -right-10 -top-10 opacity-20"><Coin size={220} /></div>
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-widest text-white/70">Available credits</div>
            <div className="display mt-1 flex items-end gap-3"><span className="text-7xl font-bold leading-none">{fmtH(w.available)}</span><span className="pb-2 text-xl text-white/80">hours</span></div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-white/15 px-3 py-1">🔒 {fmtH(w.held)} in escrow</span>
              <span className="rounded-full bg-white/15 px-3 py-1">≈ {fmtH(w.available + w.held)} total</span>
            </div>
            <div className="mt-5 max-w-xs"><Spark points={series} /></div>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-baseline justify-between"><h2 className="font-bold">Daily earn cap</h2><span className="font-mono text-sm">{fmtH(cap.used_hours)} / {fmtH(cap.cap_hours)}h today</span></div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-amber transition-all" style={{ width: `${Math.min(100, (cap.used_hours / cap.cap_hours) * 100)}%` }} /></div>
            <p className="mt-2 text-xs text-mute">Teaching beyond {fmtH(cap.cap_hours)}h in a day isn’t credited — it keeps the economy fair and stops farming.</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="font-bold">Audit the ledger</h2><p className="text-xs text-mute">Recompute every hash, check each transaction balances, and confirm no credits were created from thin air.</p></div>
              <Button size="sm" onClick={runAudit} disabled={auditing}>{auditing ? 'Checking…' : 'Verify'}</Button>
            </div>
            {auditing && <div className="mt-3 flex items-center gap-2 text-sm text-mute"><Spinner /> Re-hashing the chain…</div>}
            {audit && (
              <div className={`pop mt-3 rounded-xl p-3 text-sm ${audit.ok ? 'bg-pine-soft text-pine' : 'bg-clay-soft text-clay'}`}>
                <div className="font-bold">{audit.ok ? '✓ Chain intact — supply conserved' : '✗ Integrity problem found'}</div>
                <div className="mt-1 font-mono text-xs">{audit.entries} entries · {audit.transactions} transactions · {fmtH(audit.mintedMinutes / 60)}h minted = {fmtH(audit.circulatingMinutes / 60)}h in circulation</div>
                <div className="mt-1 break-all font-mono text-[11px] opacity-75">head {audit.headHash.slice(0, 32)}…</div>
                {!audit.ok && <ul className="mt-1 list-disc pl-4 text-xs">{audit.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="font-bold">Transaction history</h2><Chip>{w.history.length} entries</Chip></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wider text-mute"><tr><th className="px-5 py-2 font-semibold">When</th><th className="px-3 py-2 font-semibold">What</th><th className="px-3 py-2 text-right font-semibold">Change</th><th className="px-3 py-2 font-semibold">Hash</th></tr></thead>
            <tbody>
              {w.history.map((h) => {
                const t = TYPE[h.type];
                return (
                  <tr key={h.seq} className="border-t border-dashed border-line">
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-mute">{fmtDate(h.at)} {fmtTime(h.at)}</td>
                    <td className="px-3 py-2.5"><span className={`font-semibold ${t.tone}`}>{t.label}</span>{h.skill_title && <span className="text-mute"> · {h.skill_title}</span>}<div className="text-xs text-mute">{h.memo ? `${h.memo} · ` : ''}{h.bucket === 'held' ? 'escrow account' : 'available balance'}</div></td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${h.minutes > 0 ? 'text-pine' : 'text-clay'}`}>{h.minutes > 0 ? '+' : '−'}{fmtH(Math.abs(h.minutes) / 60)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-mute">{h.hash}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-mute">1 credit = 1 hour. You started with {meta?.welcomeHours}h. Every row above is chained to the one before it by a SHA-256 hash.</p>
    </div>
  );
}
