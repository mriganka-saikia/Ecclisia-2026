import { initDb, dbKind } from './db.js';
import { buildApp } from './app.js';
import { cfg } from './config.js';
import { backfillEmbeddings, embeddingsEnabled } from './lib/embeddings.js';

await initDb();
if (process.env.AUTO_SEED === 'true') {
  const { seed } = await import('../scripts/seed.js');
  const out = await seed();
  if (!out.skipped) console.log(`  seeded ${out.users.length} demo students (password: demo1234)`);
}
const app = buildApp();
app.listen(cfg.port, () => {
  console.log(`\n  TimeBank API  http://localhost:${cfg.port}`);
  console.log(`  database      ${dbKind}`);
  console.log(`  AI search     ${embeddingsEnabled() ? `on (${cfg.llmProvider})` : 'off — keyword matching fallback'}`);
  console.log(`  college mail  @${cfg.domains.join(', @')}   demo mode: ${cfg.demoMode}\n`);
  backfillEmbeddings().then((n) => n && console.log(`  embedded ${n} skills`)).catch(() => {});
});
