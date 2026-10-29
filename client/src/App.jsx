import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { api, fmtH } from './api.js';
import { Logo, Coin, Button, Avatar, Spinner } from './ui.jsx';
import Landing from './pages/Landing.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Discover from './pages/Discover.jsx';
import Sessions from './pages/Sessions.jsx';
import Wallet from './pages/Wallet.jsx';
import Teach from './pages/Teach.jsx';

const NAV = [
  { to: '/discover', label: 'Discover' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/teach', label: 'Teach' },
  { to: '/wallet', label: 'Wallet' },
];

function Shell({ children }) {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [bal, setBal] = useState(null);
  useEffect(() => {
    const load = () => api('/wallet').then(setBal).catch(() => {});
    load();
    window.addEventListener('tb:refresh', load);
    return () => window.removeEventListener('tb:refresh', load);
  }, []);
  const link = ({ isActive }) => `focus-ring rounded-lg px-3 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-pine text-white' : 'text-ink/70 hover:bg-pine-soft hover:text-pine'}`;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/discover" className="focus-ring rounded"><Logo /></Link>
          <nav className="ml-4 hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} className={link}>{n.label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/wallet" className="focus-ring flex items-center gap-2 rounded-full border border-amber/40 bg-amber-soft py-1 pl-1.5 pr-3 text-sm font-bold" title="Available credits (hours)">
              <Coin size={22} />
              <span className="font-mono">{bal ? fmtH(bal.available) : '–'}</span>
              {bal?.held > 0 && <span className="font-mono text-xs font-medium text-mute">+{fmtH(bal.held)} held</span>}
            </Link>
            <button onClick={() => { signOut(); nav('/'); }} className="focus-ring flex items-center gap-2 rounded-full" title="Sign out">
              <Avatar name={user.name} size={34} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className={link}>{n.label}</NavLink>)}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

function Protected({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/auth" state={{ from: loc.pathname }} replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { user, ready } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={ready && user ? <Navigate to="/discover" replace /> : <Landing />} />
      <Route path="/auth" element={ready && user ? <Navigate to="/discover" replace /> : <AuthPage />} />
      <Route path="/discover" element={<Protected><Discover /></Protected>} />
      <Route path="/sessions" element={<Protected><Sessions /></Protected>} />
      <Route path="/teach" element={<Protected><Teach /></Protected>} />
      <Route path="/wallet" element={<Protected><Wallet /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
