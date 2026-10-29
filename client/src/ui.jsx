import { createContext, useContext, useState, useCallback, useEffect } from 'react';

export const Coin = ({ size = 28, spin = false, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="#f2a33a" stroke="#c97d12" strokeWidth="1.5" />
    <circle cx="20" cy="20" r="13.5" fill="none" stroke="#fff3d6" strokeWidth="1" strokeDasharray="2 3" />
    <g className={spin ? 'spin-slow' : ''} style={{ transformOrigin: '20px 20px' }}>
      <path d="M20 9.5v10.8l7 4" stroke="#0f5c4d" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

export const Logo = ({ light = false }) => (
  <span className="inline-flex items-center gap-2">
    <Coin size={30} />
    <span className={`display text-[22px] font-bold ${light ? 'text-white' : 'text-pine'}`}>TimeBank</span>
  </span>
);

const BTN = {
  primary: 'bg-pine text-white hover:bg-pine-dark disabled:bg-pine/40',
  amber: 'bg-amber text-ink hover:brightness-95 disabled:opacity-50',
  ghost: 'bg-transparent text-pine hover:bg-pine-soft',
  outline: 'border border-line bg-card text-ink hover:border-pine hover:text-pine',
  danger: 'border border-clay/30 bg-clay-soft text-clay hover:bg-clay hover:text-white',
};
export const Button = ({ variant = 'primary', size = 'md', className = '', ...p }) => (
  <button
    {...p}
    className={`focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed ${size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5'} ${BTN[variant]} ${className}`}
  />
);

export const Card = ({ className = '', ...p }) => <div {...p} className={`rounded-2xl border border-line bg-card ${className}`} />;
export const Chip = ({ tone = 'neutral', className = '', ...p }) => {
  const t = { neutral: 'bg-paper text-mute border-line', pine: 'bg-pine-soft text-pine border-pine/15', amber: 'bg-amber-soft text-[#8a5a0b] border-amber/30', clay: 'bg-clay-soft text-clay border-clay/20' }[tone];
  return <span {...p} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${t} ${className}`} />;
};

export const Stars = ({ value = 0, size = 14 }) => (
  <span className="inline-flex" aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={value >= i - 0.25 ? '#f2a33a' : value >= i - 0.75 ? '#f8d28f' : '#e8e0d0'}>
        <path d="M10 1.5l2.6 5.5 6 .8-4.4 4.2 1.1 6L10 15l-5.3 3 1.1-6L1.4 7.8l6-.8z" />
      </svg>
    ))}
  </span>
);

export const StarInput = ({ value, onChange }) => (
  <span className="inline-flex gap-1">
    {[1, 2, 3, 4, 5].map((i) => (
      <button key={i} type="button" onClick={() => onChange(i)} className="focus-ring rounded" aria-label={`${i} stars`}>
        <svg width="28" height="28" viewBox="0 0 20 20" fill={value >= i ? '#f2a33a' : '#e8e0d0'}><path d="M10 1.5l2.6 5.5 6 .8-4.4 4.2 1.1 6L10 15l-5.3 3 1.1-6L1.4 7.8l6-.8z" /></svg>
      </button>
    ))}
  </span>
);

export const Avatar = ({ name = '?', size = 40 }) => {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 38% 38%)` }}>
      {initials}
    </span>
  );
};

export const Spinner = () => <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-pine/20 border-t-pine" />;

export function Modal({ onClose, title, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`rise max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`rise pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${i.tone === 'err' ? 'bg-clay text-white' : 'bg-pine text-white'}`}>{i.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-semibold">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
  </label>
);
export const inputCls = 'focus-ring w-full rounded-xl border border-line bg-white px-3.5 py-2.5 outline-none transition placeholder:text-mute/60 focus:border-pine';

// Stacked bar explaining a match score. Colours + labels, so meaning never relies on colour alone.
export const FACTORS = [
  { key: 'fit', label: 'Skill fit', color: '#0f5c4d' },
  { key: 'availability', label: 'Availability', color: '#3b6fb6' },
  { key: 'rating', label: 'Rating', color: '#f2a33a' },
  { key: 'reciprocity', label: 'Swap', color: '#c4553a' },
];
export function MatchBar({ breakdown, expanded }) {
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-line" role="img" aria-label="Match score breakdown">
        {FACTORS.map((f) => <div key={f.key} style={{ width: `${breakdown[f.key].points}%`, background: f.color }} />)}
      </div>
      {expanded && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {FACTORS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-mute"><i className="inline-block h-2 w-2 rounded-full" style={{ background: f.color }} />{f.label} <span className="opacity-60">({Math.round(breakdown[f.key].weight * 100)}%)</span></dt>
              <dd className="font-mono font-medium">{breakdown[f.key].points.toFixed(0)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export const ScoreRing = ({ score }) => {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" role="img" aria-label={`Match score ${score} out of 100`}>
      <circle cx="27" cy="27" r={r} fill="none" stroke="#e8e0d0" strokeWidth="5" />
      <circle cx="27" cy="27" r={r} fill="none" stroke="#0f5c4d" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 27 27)" />
      <text x="27" y="32" textAnchor="middle" className="fill-ink font-mono" fontSize="15" fontWeight="500">{score}</text>
    </svg>
  );
};
