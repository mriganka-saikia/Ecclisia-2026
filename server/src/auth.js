import jwt from 'jsonwebtoken';
import { cfg } from './config.js';
import { HttpError, bad } from './errors.js';

export const sign = (id) => jwt.sign({ id }, cfg.jwtSecret, { expiresIn: '7d' });
export function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  try {
    req.userId = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', cfg.jwtSecret).id;
    next();
  } catch { next(new HttpError(401, 'Please sign in')); }
}
export const parse = (schema, body) => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) { const i = r.error.issues[0]; throw bad(`${i.path.join('.') || 'input'}: ${i.message}`); }
  return r.data;
};
export const emailAllowed = (email) => {
  const dom = email.split('@')[1] || '';
  return cfg.domains.some((d) => dom === d || dom.endsWith(`.${d}`));
};
export const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, department: u.department, year: u.year, bio: u.bio,
  rating_avg: Math.round(u.rating_avg * 100) / 100, rating_count: u.rating_count, verified: u.verified,
});
