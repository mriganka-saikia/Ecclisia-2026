const BASE = (import.meta.env.VITE_API_URL || '') + '/api';
export const getToken = () => localStorage.getItem('tb_token');
export const setToken = (t) => (t ? localStorage.setItem('tb_token', t) : localStorage.removeItem('tb_token'));

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && getToken()) { setToken(null); window.dispatchEvent(new Event('tb:logout')); }
    throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status, data });
  }
  return data;
}

export const refreshWallet = () => window.dispatchEvent(new Event('tb:refresh'));
export const fmtH = (h) => `${Number.isInteger(h) ? h : h.toFixed(1)}`;
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtRel = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
