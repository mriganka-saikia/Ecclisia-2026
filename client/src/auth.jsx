import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/meta').then(setMeta).catch(() => {});
    const off = () => setUser(null);
    window.addEventListener('tb:logout', off);
    (async () => {
      if (getToken()) { try { setUser(await api('/me')); } catch { setToken(null); } }
      setReady(true);
    })();
    return () => window.removeEventListener('tb:logout', off);
  }, []);

  const signIn = useCallback((token, u) => { setToken(token); setUser(u); }, []);
  const signOut = useCallback(() => { setToken(null); setUser(null); }, []);
  return <Ctx.Provider value={{ user, setUser, meta, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}
