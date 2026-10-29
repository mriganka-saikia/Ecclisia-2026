// Half-open intervals [start, end) measured in absolute minutes. Tiny, dependency-free, well-tested by smoke.js.
export const normalize = (iv) => {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
};
export const subtract = (base, cut) => {
  const c = normalize(cut);
  const out = [];
  for (const [a0, b] of normalize(base)) {
    let a = a0;
    for (const [ca, cb] of c) {
      if (cb <= a || ca >= b) continue;
      if (ca > a) out.push([a, ca]);
      a = Math.max(a, cb);
      if (a >= b) break;
    }
    if (a < b) out.push([a, b]);
  }
  return out;
};
export const intersect = (A, B) => {
  const a = normalize(A), b = normalize(B), out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s, e]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
};
export const clip = (iv, lo, hi) => iv.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b > a);
export const total = (iv) => iv.reduce((n, [a, b]) => n + (b - a), 0);
