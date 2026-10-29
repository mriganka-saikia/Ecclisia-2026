export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (m, x) => new HttpError(400, m, x);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const conflict = (m, x) => new HttpError(409, m, x);
