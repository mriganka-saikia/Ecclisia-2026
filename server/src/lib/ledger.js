import crypto from 'node:crypto';
import { cfg } from '../config.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const rowHash = (r) =>
  sha([r.prev_hash, r.seq, r.txn_id, r.user_id ?? 'SYSTEM', r.bucket, r.delta, r.type, r.session_id ?? '', new Date(r.created_at).toISOString()].join('|'));


export async function postTxn(t, { type, sessionId = null, memo = '', entries, at = new Date() }) {
  if (entries.reduce((a, e) => a + e.delta, 0) !== 0) throw new Error('Unbalanced ledger transaction');
  const head = (await t.query('SELECT seq, hash FROM ledger_head WHERE id = 1 FOR UPDATE')).rows[0];
  let { seq, hash } = head;
  const txn_id = crypto.randomUUID();
  for (const e of entries) {
    seq += 1;
    const row = { seq, txn_id, user_id: e.userId ?? null, bucket: e.bucket, delta: e.delta, type, session_id: sessionId, prev_hash: hash, created_at: at };
    row.hash = rowHash(row);
    await t.query(
      `INSERT INTO ledger (seq, txn_id, user_id, bucket, delta, type, session_id, memo, prev_hash, hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [seq, txn_id, row.user_id, row.bucket, row.delta, type, sessionId, memo, row.prev_hash, row.hash, at.toISOString()],
    );
    hash = row.hash;
  }
  await t.query('UPDATE ledger_head SET seq = $1, hash = $2 WHERE id = 1', [seq, hash]);
  return txn_id;
}

export async function balances(t, userId) {
  const { rows } = await t.query(
    `SELECT bucket, COALESCE(SUM(delta),0)::int AS v FROM ledger WHERE user_id = $1 GROUP BY bucket`, [userId]);
  const out = { available: 0, held: 0 };
  for (const r of rows) out[r.bucket] = Number(r.v);
  return out;
}

export async function grantWelcome(t, userId) {
  const { rows } = await t.query(`SELECT 1 FROM ledger WHERE user_id = $1 AND type = 'GRANT' LIMIT 1`, [userId]);
  if (rows.length) return false;
  await postTxn(t, {
    type: 'GRANT', memo: 'Welcome credits',
    entries: [{ userId: null, bucket: 'mint', delta: -cfg.welcomeMin }, { userId, bucket: 'available', delta: cfg.welcomeMin }],
  });
  return true;
}


export async function verifyLedger(t) {
  const { rows } = await t.query('SELECT * FROM ledger ORDER BY seq ASC');
  const head = (await t.query('SELECT seq, hash FROM ledger_head WHERE id = 1')).rows[0];
  const problems = [];
  let prev = 'GENESIS', expectSeq = 1, minted = 0;
  const txnSum = new Map(), bal = new Map();
  for (const r of rows) {
    if (r.seq !== expectSeq) problems.push(`seq gap at ${expectSeq}`);
    if (r.prev_hash !== prev) problems.push(`broken link at #${r.seq}`);
    if (rowHash(r) !== r.hash) problems.push(`hash mismatch at #${r.seq}`);
    txnSum.set(r.txn_id, (txnSum.get(r.txn_id) || 0) + r.delta);
    if (r.user_id) {
      const k = `${r.user_id}:${r.bucket}`;
      const v = (bal.get(k) || 0) + r.delta;
      bal.set(k, v);
      if (v < 0) problems.push(`negative balance for user ${r.user_id} (${r.bucket}) at #${r.seq}`);
    } else minted += -r.delta;
    prev = r.hash; expectSeq = r.seq + 1;
  }
  for (const [id, s] of txnSum) if (s !== 0) problems.push(`txn ${id.slice(0, 8)} not zero-sum`);
  if (head.seq !== rows.length || head.hash !== (rows.at(-1)?.hash ?? 'GENESIS')) problems.push('ledger head does not match last row');
  let circulating = 0;
  for (const v of bal.values()) circulating += v;
  if (circulating !== minted) problems.push('circulating supply != minted supply');
  return { ok: problems.length === 0, problems: problems.slice(0, 10), entries: rows.length, transactions: txnSum.size, mintedMinutes: minted, circulatingMinutes: circulating, headHash: head.hash, checkedAt: new Date().toISOString() };
}
