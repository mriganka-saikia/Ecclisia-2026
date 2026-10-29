import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Logo, Button, Field, inputCls, Card } from '../ui.jsx';

export default function AuthPage() {
  const [sp] = useSearchParams();
  const { meta, signIn } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState(sp.get('mode') === 'login' ? 'login' : 'signup');
  const [step, setStep] = useState('form'); // form | otp
  const [f, setF] = useState({ name: '', email: '', password: '', department: '', year: '' });
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const domain = meta?.collegeDomain || 'college.edu';

  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message); if (e.data?.needsVerification) setStep('otp'); } finally { setBusy(false); } };
  const login = (email, password) => run(async () => { const r = await api('/auth/login', { method: 'POST', body: { email, password } }); signIn(r.token, r.user); nav('/discover'); });

  useEffect(() => { if (sp.get('demo') && meta) setF((x) => ({ ...x, email: `riya@${meta.collegeDomain}`, password: 'demo1234' })); }, [sp, meta]);

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'login') return login(f.email, f.password);
    if (step === 'form') return run(async () => { const r = await api('/auth/register', { method: 'POST', body: f }); setDevOtp(r.devOtp || ''); setStep('otp'); });
    return run(async () => { const r = await api('/auth/verify', { method: 'POST', body: { email: f.email, code } }); signIn(r.token, r.user); nav('/discover'); });
  };

  return (
    <div className="paper-grain grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Link to="/"><Logo /></Link></div>
        <Card className="rise p-6 shadow-lg sm:p-8">
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-paper p-1 text-sm font-semibold" role="tablist">
            {[['signup', 'Create account'], ['login', 'Sign in']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setStep('form'); setErr(''); }} className={`focus-ring rounded-lg py-2 transition ${mode === k ? 'bg-card shadow text-pine' : 'text-mute'}`}>{l}</button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && step === 'otp' ? (
              <>
                <p className="text-sm text-mute">We sent a 6-digit code to <b className="text-ink">{f.email}</b>.</p>
                {devOtp && (
                  <button type="button" onClick={() => setCode(devOtp)} className="focus-ring w-full rounded-xl border border-dashed border-amber bg-amber-soft px-3 py-2 text-left text-sm">
                    <b>Demo mode:</b> your code is <span className="font-mono font-bold">{devOtp}</span> — tap to fill
                  </button>
                )}
                <Field label="Verification code"><input className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
              </>
            ) : (
              <>
                {mode === 'signup' && (
                  <>
                    <Field label="Full name"><input className={inputCls} value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" /></Field>
                  </>
                )}
                <Field label="College email" hint={mode === 'signup' ? `Must end with @${domain}` : undefined}>
                  <input className={inputCls} type="email" value={f.email} onChange={set('email')} required placeholder={`you@${domain}`} autoComplete="email" />
                </Field>
                <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
                  <input className={inputCls} type="password" value={f.password} onChange={set('password')} required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                </Field>
                {mode === 'signup' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Department"><input className={inputCls} value={f.department} onChange={set('department')} placeholder="e.g. CSE" /></Field>
                    <Field label="Year"><input className={inputCls} value={f.year} onChange={set('year')} placeholder="e.g. 2nd" /></Field>
                  </div>
                )}
              </>
            )}
            {err && <p role="alert" className="rounded-xl bg-clay-soft px-3 py-2 text-sm font-medium text-clay">{err}</p>}
            <Button className="w-full" disabled={busy || (step === 'otp' && mode === 'signup' && code.length !== 6)}>
              {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : step === 'otp' ? 'Verify & claim 3 credits' : 'Send verification code'}
            </Button>
          </form>

          {mode === 'login' && meta?.demoMode && (
            <button onClick={() => login(`riya@${domain}`, 'demo1234')} className="focus-ring mt-4 w-full rounded-xl border border-dashed border-pine/40 py-2.5 text-sm font-semibold text-pine hover:bg-pine-soft">
              ⚡ Jump in as demo student (Riya)
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
