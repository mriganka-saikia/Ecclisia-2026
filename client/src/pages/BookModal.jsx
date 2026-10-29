import { useEffect, useState } from 'react';
import { api, fmtDate, fmtTime, fmtH, refreshWallet } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, Button, Avatar, Stars, Spinner, Chip, useToast, inputCls } from '../ui.jsx';

export default function BookModal({ skillId, onClose, onBooked }) {
  const { meta } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [minutes, setMinutes] = useState(60);
  const [slots, setSlots] = useState(null);
  const [day, setDay] = useState(0);
  const [pick, setPick] = useState(null);
  const [note, setNote] = useState('');
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api(`/skills/${skillId}`).then(setInfo); api('/wallet').then(setWallet); }, [skillId]);
  useEffect(() => { setSlots(null); setPick(null); setDay(0); api(`/skills/${skillId}/slots?minutes=${minutes}`).then(setSlots); }, [skillId, minutes]);

  const cost = minutes / 60;
  const enough = wallet ? wallet.available >= cost : true;
  const book = async () => {
    setBusy(true); setErr('');
    try {
      await api('/sessions', { method: 'POST', body: { skill_id: skillId, start_at: pick, minutes, note: note || undefined } });
      toast(`Booked! ${fmtH(cost)} credit held in escrow.`); refreshWallet(); onBooked?.(); onClose();
    } catch (e) { setErr(e.message); setSlots(null); api(`/skills/${skillId}/slots?minutes=${minutes}`).then(setSlots); setPick(null); } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title="Book a session" wide>
      {!info ? <div className="grid h-64 place-items-center"><Spinner /></div> : (
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <Avatar name={info.mentor.name} size={52} />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-tight">{info.skill.title}</h2>
              <p className="text-sm text-mute">with <b className="text-ink">{info.mentor.name}</b> · {info.mentor.department}{info.mentor.year ? `, ${info.mentor.year}` : ''}</p>
              <div className="mt-1 flex items-center gap-2 text-sm"><Stars value={info.mentor.rating_avg} /><span className="font-mono text-xs text-mute">{info.mentor.rating_count ? `${info.mentor.rating_avg.toFixed(1)} · ${info.mentor.rating_count} {info.mentor.rating_count === 1 ? "review" : "reviews"}` : 'New mentor'}</span><Chip tone="pine">{info.mentor.hours_taught}h taught</Chip></div>
            </div>
            <button onClick={onClose} className="focus-ring rounded-full p-1 text-2xl leading-none text-mute hover:text-ink" aria-label="Close">×</button>
          </div>
          {info.skill.description && <p className="mt-4 rounded-xl bg-paper p-3 text-sm">{info.skill.description}</p>}
          {info.reviews.length > 0 && (
            <p className="mt-3 text-sm italic text-mute">“{info.reviews[0].comment}” <span className="not-italic">— {info.reviews[0].by}</span></p>
          )}

          <div className="mt-6">
            <div className="mb-2 text-sm font-semibold">How long?</div>
            <div className="flex flex-wrap gap-2">
              {(meta?.durations || [30, 60, 90, 120]).map((m) => (
                <button key={m} onClick={() => setMinutes(m)} className={`focus-ring rounded-xl border px-4 py-2 text-sm font-semibold transition ${minutes === m ? 'border-pine bg-pine text-white' : 'border-line bg-card hover:border-pine'}`}>
                  {m} min <span className="font-mono text-xs opacity-75">· {fmtH(m / 60)} cr</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-semibold">Pick a time</div>
            {!slots ? <Spinner /> : slots.days.length === 0 ? (
              <p className="rounded-xl bg-clay-soft p-3 text-sm text-clay">No open {minutes}-minute slots in the next 7 days. Try a shorter session.</p>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-2" role="tablist">
                  {slots.days.map((d, i) => (
                    <button key={d.date} role="tab" aria-selected={day === i} onClick={() => { setDay(i); setPick(null); }} className={`focus-ring shrink-0 rounded-xl border px-3 py-1.5 text-sm font-semibold ${day === i ? 'border-ink bg-ink text-white' : 'border-line bg-card'}`}>{fmtDate(d.slots[0])}</button>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {(slots.days[day] || slots.days[0]).slots.map((s) => (
                    <button key={s} onClick={() => setPick(s)} className={`focus-ring rounded-xl border px-2 py-2 font-mono text-sm transition ${pick === s ? 'border-pine bg-pine text-white' : 'border-line bg-white hover:border-pine'}`}>{fmtTime(s)}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="mt-5"><input className={inputCls} placeholder="Anything the mentor should know? (optional)" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} /></div>

          <div className="mt-6 rounded-2xl border border-amber/40 bg-amber-soft p-4 text-sm">
            <div className="flex justify-between"><span>Held in escrow now</span><b className="font-mono">{fmtH(cost)} credit</b></div>
            {wallet && <div className="mt-1 flex justify-between text-mute"><span>Balance after booking</span><span className="font-mono">{fmtH(wallet.available - cost)}</span></div>}
            <p className="mt-2 text-xs text-mute">Released to {info.mentor.name.split(' ')[0]} only when you both confirm the session happened. Cancel any time before it starts for a full refund.</p>
          </div>
          {!enough && <p className="mt-3 rounded-xl bg-clay-soft p-3 text-sm font-medium text-clay">Not enough credits — teach a session to earn more.</p>}
          {err && <p role="alert" className="mt-3 rounded-xl bg-clay-soft p-3 text-sm font-medium text-clay">{err}</p>}
          <Button className="mt-5 w-full py-3 text-lg" disabled={!pick || busy || !enough} onClick={book}>{busy ? 'Booking…' : pick ? `Book ${fmtDate(pick)} at ${fmtTime(pick)}` : 'Choose a time'}</Button>
        </div>
      )}
    </Modal>
  );
}
