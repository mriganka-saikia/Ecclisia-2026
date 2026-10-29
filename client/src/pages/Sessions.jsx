import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, fmtTime, fmtH, refreshWallet } from '../api.js';
import { Card, Chip, Button, Avatar, StarInput, Spinner, useToast, Modal, inputCls } from '../ui.jsx';
import CalendarButtons from './CalendarButtons.jsx';

function ReviewModal({ s, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const go = async () => { setBusy(true); try { await api(`/sessions/${s.id}/review`, { method: 'POST', body: { rating, comment } }); toast('Thanks — your rating helps the next student.'); onDone(); onClose(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose} title="Rate your session">
      <div className="p-6">
        <h2 className="text-2xl font-bold">How was {s.mentor.name.split(' ')[0]}’s session?</h2>
        <p className="text-sm text-mute">{s.skill_title}</p>
        <div className="my-5"><StarInput value={rating} onChange={setRating} /></div>
        <textarea className={inputCls} rows={3} maxLength={500} placeholder="What went well? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Not now</Button><Button onClick={go} disabled={busy}>Submit rating</Button></div>
      </div>
    </Modal>
  );
}

function SessionCard({ s, act, onReview, demo }) {
  const mine = s.role === 'mentor' ? s.confirmed.mentor : s.confirmed.learner;
  const theirs = s.role === 'mentor' ? s.confirmed.learner : s.confirmed.mentor;
  const other = s.role === 'mentor' ? s.learner : s.mentor;
  return (
    <Card className="rise p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={other.name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold leading-tight">{s.skill_title}</h3>
            <Chip tone={s.role === 'mentor' ? 'pine' : 'amber'}>{s.role === 'mentor' ? `teaching · +${fmtH(s.credits)} cr` : `learning · −${fmtH(s.credits)} cr`}</Chip>
          </div>
          <p className="text-sm text-mute">with {other.name}</p>
          <p className="mt-1 font-mono text-sm">{fmtDate(s.start_at)} · {fmtTime(s.start_at)} – {fmtTime(s.end_at)}</p>
        </div>
        <Chip tone={s.status === 'completed' ? 'pine' : s.status === 'cancelled' ? 'clay' : 'neutral'}>{s.status}</Chip>
      </div>

      {s.status === 'booked' && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Chip tone={mine ? 'pine' : 'neutral'}>{mine ? '✓' : '○'} You confirmed</Chip>
            <Chip tone={theirs ? 'pine' : 'neutral'}>{theirs ? '✓' : '○'} {other.name.split(' ')[0]} confirmed</Chip>
            {s.role === 'learner' && <Chip tone="amber">{fmtH(s.credits)} cr in escrow</Chip>}
          </div>
          {s.note && <p className="mt-2 text-sm italic text-mute">“{s.note}”</p>}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-line pt-3">
            {s.meet_url && <a href={s.meet_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Join video room ↗</Button></a>}
            <CalendarButtons s={s} />
            {!mine && <Button size="sm" onClick={() => act(s.id, 'confirm')} title={demo ? 'Demo mode lets you confirm early' : ''}>Confirm it happened</Button>}
            <Button size="sm" variant="danger" onClick={() => act(s.id, 'cancel')}>{s.role === 'learner' ? 'Cancel & refund' : 'Cancel'}</Button>
          </div>
        </>
      )}
      {s.status === 'completed' && s.role === 'learner' && (
        <div className="mt-3 border-t border-dashed border-line pt-3">
          {s.reviewed ? <span className="text-sm text-mute">You rated this {s.my_rating}★</span> : <Button size="sm" variant="amber" onClick={() => onReview(s)}>Rate this session</Button>}
        </div>
      )}
    </Card>
  );
}

export default function Sessions() {
  const [list, setList] = useState(null);
  const [tab, setTab] = useState('booked');
  const [rev, setRev] = useState(null);
  const toast = useToast();
  const load = () => api('/sessions').then(setList);
  useEffect(() => { load(); }, []);
  const act = async (id, what) => {
    try {
      const r = await api(`/sessions/${id}/${what}`, { method: 'POST' });
      toast(what === 'cancel' ? 'Cancelled — credits refunded.' : r.released ? 'Both confirmed — credits released! 🎉' : 'Confirmed. Waiting for your partner.');
      refreshWallet(); load();
    } catch (e) { toast(e.message, 'err'); }
  };
  const tabs = [['booked', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
  const shown = (list || []).filter((s) => s.status === tab).sort((a, b) => (tab === 'booked' ? new Date(a.start_at) - new Date(b.start_at) : new Date(b.start_at) - new Date(a.start_at)));
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Your sessions</h1>
      <div className="mt-5 inline-flex rounded-xl bg-line/50 p-1" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`focus-ring rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === k ? 'bg-card text-pine shadow' : 'text-mute'}`}>{l} <span className="font-mono text-xs opacity-60">{(list || []).filter((s) => s.status === k).length}</span></button>)}
      </div>
      {!list ? <div className="mt-10 grid place-items-center"><Spinner /></div> : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {shown.map((s) => <SessionCard key={s.id} s={s} act={act} onReview={setRev} demo={s.can_confirm_now} />)}
          {!shown.length && <Card className="p-8 text-center text-mute md:col-span-2">Nothing here yet. <Link to="/discover" className="font-semibold text-pine underline">Find a mentor →</Link></Card>}
        </div>
      )}
      {rev && <ReviewModal s={rev} onClose={() => setRev(null)} onDone={load} />}
    </div>
  );
}
