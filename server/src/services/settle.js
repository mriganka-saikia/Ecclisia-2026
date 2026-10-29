import { query, tx } from '../db.js';
import { cfg } from '../config.js';
import { releaseEscrow, refundEscrow } from './sessions.js';

const H = 3600_000;

/**
 * Settle sessions nobody finished. Runs on a timer and lazily whenever sessions or the wallet are read.
 *   - one side confirmed, the other silent for AUTO_RELEASE_HOURS after the end  -> pay the mentor
 *   - nobody confirmed for AUTO_REFUND_HOURS after the end                      -> refund the learner
 *   - dispute unresolved for DISPUTE_RESOLVE_DAYS                               -> refund the learner
 * Each session is re-checked under a row lock, so overlapping runs can never settle twice.
 */
export async function settleOverdue(now = new Date()) {
  const releaseBefore = new Date(now.getTime() - cfg.autoReleaseHours * H).toISOString();
  const disputeBefore = new Date(now.getTime() - cfg.disputeDays * 24 * H).toISOString();
  const refundBefore = new Date(now.getTime() - cfg.autoRefundHours * H);
  const { rows } = await query(
    `SELECT id FROM sessions WHERE (status = 'booked' AND end_at < $1) OR (status = 'disputed' AND disputed_at < $2)`,
    [releaseBefore, disputeBefore]);

  const out = { released: 0, refunded: 0 };
  for (const { id } of rows) {
    await tx(async (t) => {
      const s = (await t.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!s) return;
      if (s.status === 'booked' && new Date(s.end_at) < new Date(releaseBefore)) {
        if (s.mentor_confirmed_at || s.learner_confirmed_at) {
          await t.query(`UPDATE sessions SET status = 'completed', completed_at = $2, resolution = 'auto_release' WHERE id = $1`, [id, now.toISOString()]);
          await releaseEscrow(t, s, `Auto-released: one side confirmed, the other was silent for ${cfg.autoReleaseHours}h`);
          out.released++;
        } else if (new Date(s.end_at) < refundBefore) {
          await t.query(`UPDATE sessions SET status = 'cancelled', resolution = 'auto_refund' WHERE id = $1`, [id]);
          await refundEscrow(t, s, `Auto-refunded: nobody confirmed within ${cfg.autoRefundHours}h`);
          out.refunded++;
        }
      } else if (s.status === 'disputed' && new Date(s.disputed_at) < new Date(disputeBefore)) {
        await t.query(`UPDATE sessions SET status = 'cancelled', resolution = 'dispute_timeout' WHERE id = $1`, [id]);
        await refundEscrow(t, s, `Dispute unresolved after ${cfg.disputeDays} days — refunded to learner`);
        out.refunded++;
      }
    });
  }
  return out;
}
