import { cfg } from '../config.js';
import { query } from '../db.js';

// Optional AI layer. Every failure path returns null so callers transparently fall back to keyword search.
export const embeddingsEnabled = () => !!cfg.llmKey;
const cache = new Map();

async function call(text, kind) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    if (cfg.llmProvider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.llmKey}` },
        body: JSON.stringify({ model: cfg.embeddingModel || 'text-embedding-3-small', input: text, dimensions: 256 }),
      });
      if (!r.ok) throw new Error(`openai ${r.status}`);
      return (await r.json()).data[0].embedding;
    }
    const model = cfg.embeddingModel || 'gemini-embedding-001';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.llmKey },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 256,
      }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    return (await r.json()).embedding.values;
  } finally {
    clearTimeout(timer);
  }
}

export async function embed(text, kind = 'document') {
  if (!embeddingsEnabled() || !text?.trim()) return null;
  const key = `${kind}:${text}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const v = await call(text, kind);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    cache.set(key, v);
    return v;
  } catch (e) {
    console.warn(`[ai] embedding failed, using keyword fallback: ${e.message}`);
    return null;
  }
}

export const skillText = (s) => `${s.title}. Category: ${s.category}. ${s.description || ''}`.trim();

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export async function embedSkillById(id) {
  const { rows } = await query('SELECT id, title, category, description FROM skills WHERE id = $1', [id]);
  if (!rows[0]) return;
  const v = await embed(skillText(rows[0]), 'document');
  if (v) await query('UPDATE skills SET embedding = $1::jsonb WHERE id = $2', [JSON.stringify(v), id]);
}

export async function backfillEmbeddings() {
  if (!embeddingsEnabled()) return 0;
  const { rows } = await query(`SELECT id FROM skills WHERE kind = 'offer' AND active AND embedding IS NULL LIMIT 200`);
  for (const r of rows) await embedSkillById(r.id);
  return rows.length;
}
