// Lightweight lexical matcher: stop-words, stemming, synonyms and typo tolerance. Powers the keyword fallback
// and also contributes to the hybrid score when AI embeddings are available.
const STOP = new Set(('a an the i me my we you your want wanna to learn learning teach teaching help with in on for of and or need some how can ' +
  'someone who please about at from get better improve session class lesson tutor tutoring mentor good is am looking find study basics basic ' +
  'beginner beginners intro introduction advanced started start new really very like would').split(' '));

const SYN = {
  js: ['javascript'], ts: ['typescript'], py: ['python'], ml: ['machine', 'learn'], ai: ['machine', 'learn', 'ai'],
  dsa: ['data', 'structure', 'algorithm'], cpp: ['c++'], dev: ['develop'], webdev: ['web', 'develop'], coding: ['program', 'code'],
  code: ['program', 'code'], maths: ['math'], calc: ['calculus'], stats: ['statistic'], ui: ['design', 'ui'], ux: ['design', 'ux'],
  guitar: ['guitar', 'music'], piano: ['piano', 'music'], keyboard: ['keyboard', 'music'], singing: ['vocal', 'music', 'sing'], vocals: ['vocal', 'music'],
  excel: ['spreadsheet', 'excel'], ppt: ['presentation'], resume: ['cv', 'resume', 'career'], cv: ['cv', 'resume', 'career'],
  interview: ['interview', 'career'], gym: ['fitness', 'workout'], yoga: ['yoga', 'fitness'], photoshop: ['photoshop', 'design'], figma: ['figma', 'design'],
};

export const stem = (w) => {
  let s = w;
  if (s.length > 5 && s.endsWith('ing')) { s = s.slice(0, -3); if (/(.)\1$/.test(s)) s = s.slice(0, -1); }
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
};

export const tokens = (text, { expand = true } = {}) => {
  const raw = (text || '').toLowerCase().replace(/[^a-z0-9+#\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of raw) {
    if (STOP.has(w)) continue;
    const syn = expand && SYN[w];
    if (syn) syn.forEach((x) => out.push(stem(x))); else out.push(stem(w));
  }
  return [...new Set(out)];
};

// Optimal-string-alignment distance: insert/delete/substitute/transpose each cost 1 ("pyhton" -> "python" = 1)
export const editDistance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
};

/** 0..1 — how well the query tokens are covered by a skill's title / category / description. */
export function lexScore(qTokens, { title, category, description }) {
  if (!qTokens.length) return 0;
  const T = tokens(title, { expand: false }), C = tokens(category, { expand: false }), D = new Set(tokens(description, { expand: false }));
  const titleStr = T.join(' ');
  let sum = 0;
  for (const q of qTokens) {
    let best = 0;
    if (T.includes(q)) best = 1;
    else if (q.length >= 3 && titleStr.includes(q)) best = 0.85;
    else if (C.includes(q)) best = 0.6;
    else if (D.has(q)) best = 0.45;
    else {
      // typo tolerance: 1 edit for short words, 2 for long ones
      if (q.length >= 4) {
        const limit = q.length >= 7 ? 2 : 1;
        const dmin = Math.min(99, ...[...T, ...C].map((t) => editDistance(q, t)));
        if (dmin <= limit) best = 0.8 - 0.1 * dmin;
      }
    }
    sum += best;
  }
  return sum / qTokens.length;
}

export const detectLevel = (q) => {
  const s = q.toLowerCase();
  if (/\b(basics?|beginner|intro|introduction|starting|from scratch|newbie)\b/.test(s)) return 'beginner';
  if (/\b(advanced|expert|deep dive)\b/.test(s)) return 'advanced';
  return null;
};
