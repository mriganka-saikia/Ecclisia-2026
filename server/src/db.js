import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = [path.join(here, '../../db/schema.sql'), path.join(here, '../db/schema.sql')].find((p) => fs.existsSync(p));

let impl;
export let dbKind = 'unset';

export async function initDb() {
  if (impl) return impl;
  const schema = fs.readFileSync(schemaPath, 'utf8');

  if (cfg.databaseUrl) {
    const { default: pg } = await import('pg');
    const ssl = /localhost|127\.0\.0\.1/.test(cfg.databaseUrl) || process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool({ connectionString: cfg.databaseUrl, ssl, max: 10 });
    // Isolate TimeBank in its own schema so it never collides with tables already in the database
    // (e.g. leftovers from another project). The SET is awaited once per physical connection.
    const schemaName = (process.env.DB_SCHEMA || 'timebank').replace(/[^a-z0-9_]/gi, '');
    const ready = new WeakSet();
    const acquire = async () => {
      const c = await pool.connect();
      try {
        if (!ready.has(c)) { await c.query(`SET search_path TO ${schemaName}, public`); ready.add(c); }
      } catch (e) { c.release(true); throw e; }
      return c;
    };
    const run = async (t, p) => {
      const c = await acquire();
      try { return await c.query(t, p); } finally { c.release(); }
    };
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    impl = {
      query: run,
      exec: run,
      async tx(fn) {
        const c = await acquire();
        try {
          await c.query('BEGIN');
          const out = await fn({ query: (t, p) => c.query(t, p) });
          await c.query('COMMIT');
          return out;
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      },
    };
    dbKind = 'postgres';
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR === 'memory' ? undefined : process.env.PGLITE_DIR || path.join(here, '../.data/pglite');
    if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
    const db = new PGlite(dir);
    await db.waitReady;
    impl = {
      query: (t, p) => db.query(t, p),
      exec: (sql) => db.exec(sql),
      tx: (fn) => db.transaction((tx) => fn({ query: (t, p) => tx.query(t, p) })),
    };
    dbKind = dir ? 'pglite (embedded Postgres, persisted)' : 'pglite (in-memory)';
  }
  await impl.exec(schema);
  return impl;
}

export const query = (t, p) => impl.query(t, p);
export const tx = (fn) => impl.tx(fn);
// Build "$1,$2,$3" placeholders for IN lists (works on both drivers)
export const inList = (arr, offset = 0) => arr.map((_, i) => `$${i + 1 + offset}`).join(',');