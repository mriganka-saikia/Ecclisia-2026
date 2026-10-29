import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Chip, Button, Field, inputCls, Spinner, useToast } from '../ui.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7:00 – 22:00 start hours
const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;

function AddSkill({ kind, onAdded }) {
  const { meta } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ title: '', category: 'Programming', level: 'all', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/skills', { method: 'POST', body: { ...f, kind } }); setF({ ...f, title: '', description: '' }); toast(kind === 'offer' ? 'Skill listed — students can find you now.' : 'Added to your wish-list.'); onAdded(); }
    catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
        <Field label={kind === 'offer' ? 'I can teach…' : 'I want to learn…'}><input className={inputCls} value={f.title} onChange={set('title')} required minLength={2} maxLength={80} placeholder={kind === 'offer' ? 'e.g. Guitar for Beginners' : 'e.g. Spanish conversation'} /></Field>
        <Field label="Category"><select className={inputCls} value={f.category} onChange={set('category')}>{(meta?.categories || []).map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      {kind === 'offer' && (
        <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
          <Field label="Best for"><select className={inputCls} value={f.level} onChange={set('level')}>{(meta?.levels || []).map((l) => <option key={l} value={l}>{l === 'all' ? 'all levels' : l}</option>)}</select></Field>
          <Field label="What will they learn?" hint="This text powers AI search — be specific."><input className={inputCls} value={f.description} onChange={set('description')} maxLength={400} placeholder="Open chords, strumming patterns and your first full song." /></Field>
        </div>
      )}
      <Button size="sm" disabled={busy}>{kind === 'offer' ? 'Add skill' : 'Add to wish-list'}</Button>
    </form>
  );
}

function Availability() {
  const toast = useToast();
  const [cells, setCells] = useState(null); // Set of "d-h"
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    api('/availability').then((rows) => {
      const s = new Set();
      for (const r of rows) for (let m = r.start_min; m < r.end_min; m += 60) s.add(`${r.weekday}-${Math.floor(m / 60)}`);
      setCells(s);
    });
  }, []);
  const toggle = (k) => { const n = new Set(cells); n.has(k) ? n.delete(k) : n.add(k); setCells(n); setDirty(true); };
  const preset = (days, from, to) => { const n = new Set(cells); for (const d of days) for (let h = from; h < to; h++) n.add(`${d}-${h}`); setCells(n); setDirty(true); };
  const windows = useMemo(() => {
    if (!cells) return [];
    const out = [];
    for (let d = 0; d < 7; d++) {
      let start = null;
      for (let h = 7; h <= 23; h++) {
        const on = cells.has(`${d}-${h}`);
        if (on && start === null) start = h;
        if (!on && start !== null) { out.push({ weekday: d, start_min: start * 60, end_min: h * 60 }); start = null; }
      }
    }
    return out;
  }, [cells]);
  const save = async () => { try { await api('/availability', { method: 'PUT', body: { windows } }); setDirty(false); toast('Availability saved.'); } catch (e) { toast(e.message, 'err'); } };
  if (!cells) return <Spinner />;
  const total = windows.reduce((n, w) => n + (w.end_min - w.start_min) / 60, 0);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => preset([1, 2, 3, 4, 5], 18, 21)}>+ Weekday evenings</Button>
        <Button size="sm" variant="outline" onClick={() => preset([0, 6], 10, 14)}>+ Weekend mornings</Button>
        <Button size="sm" variant="ghost" onClick={() => { setCells(new Set()); setDirty(true); }}>Clear</Button>
        <span className="ml-auto font-mono text-xs text-mute">{total}h / week</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-1 text-center text-[11px]" role="grid" aria-label="Weekly availability">
          <thead><tr><th />{HOURS.map((h) => <th key={h} className="font-mono font-medium text-mute">{hourLabel(h)}</th>)}</tr></thead>
          <tbody>
            {DAYS.map((d, di) => (
              <tr key={d}>
                <th className="pr-1 text-right text-xs font-semibold">{d}</th>
                {HOURS.map((h) => {
                  const on = cells.has(`${di}-${h}`);
                  return <td key={h}><button onClick={() => toggle(`${di}-${h}`)} aria-pressed={on} aria-label={`${d} ${hourLabel(h)}`} className={`focus-ring h-7 w-full rounded-md border transition ${on ? 'border-pine bg-pine' : 'border-line bg-white hover:border-pine/60'}`} /></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button className="mt-4" onClick={save} disabled={!dirty}>Save availability</Button>
    </div>
  );
}

export default function Teach() {
  const [skills, setSkills] = useState(null);
  const toast = useToast();
  const load = () => api('/me/skills').then(setSkills);
  useEffect(() => { load(); }, []);
  const del = async (id) => { await api(`/skills/${id}`, { method: 'DELETE' }); toast('Removed.'); load(); };
  const List = ({ kind }) => (
    <div className="flex flex-wrap gap-2">
      {(skills || []).filter((s) => s.kind === kind).map((s) => (
        <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-3 pr-1.5 text-sm font-medium">
          {s.title}<Chip>{s.category}</Chip>
          <button onClick={() => del(s.id)} className="focus-ring grid h-6 w-6 place-items-center rounded-full text-mute hover:bg-clay-soft hover:text-clay" aria-label={`Remove ${s.title}`}>×</button>
        </span>
      ))}
      {skills && !skills.some((s) => s.kind === kind) && <span className="text-sm text-mute">Nothing yet.</span>}
    </div>
  );
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Teach & learn</h1>
      <p className="mt-1 text-mute">The more you list, the better your matches — mentors who want to learn what you teach get ranked higher for you.</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-5"><h2 className="text-xl font-bold">Skills I teach <Chip tone="pine">earn 1 cr / hour</Chip></h2><div className="mt-3"><List kind="offer" /></div><AddSkill kind="offer" onAdded={load} /></Card>
        <Card className="p-5"><h2 className="text-xl font-bold">Skills I want to learn</h2><div className="mt-3"><List kind="want" /></div><AddSkill kind="want" onAdded={load} /></Card>
      </div>
      <Card className="mt-5 p-5"><h2 className="text-xl font-bold">When am I free to teach?</h2><p className="mb-3 text-sm text-mute">Tap the hours you’re usually available. Students can only book inside these windows, and the same grid helps match you with mentors.</p><Availability /></Card>
    </div>
  );
}
