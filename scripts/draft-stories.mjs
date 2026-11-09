// Draft topic-specific stories with Gemini: `pnpm stories:draft [--force]`.
// Needs GOOGLE_CLOUD_PROJECT and GEMINI_ACCESS_TOKEN (see .env.example), or
// run it in Cloud Shell. Every draft must be reviewed by a person afterwards.
// Paid calls: refused outside PAID_API_UNTIL (enforced in createGemini) and
// capped at MAX_GEMINI_CALLS_PER_DAY (at most 50) per run.
import { createGemini } from '../server/gemini.mjs';
import { dailyLimit, paidApiOpen } from '../server/paid.mjs';
import { loadCatalog } from '../server/routes.mjs';
import { auditStories, draftMissingStories, loadStories, saveStories } from '../server/stories.mjs';

if (!paidApiOpen()) {
  console.error('有料APIの利用期間外です。.env の PAID_API_UNTIL(例: 2026-11-14T23:59:59+09:00)を確認してください。');
  process.exit(1);
}
const client = createGemini();
if (!client.enabled) {
  console.error('Geminiが未設定です。.env に GOOGLE_CLOUD_PROJECT と GEMINI_ACCESS_TOKEN を入れてください。');
  process.exit(1);
}
const maxCalls = dailyLimit(process.env.MAX_GEMINI_CALLS_PER_DAY);
let calls = 0;
const gemini = {
  ...client,
  generateJson: async (args) => {
    if (calls >= maxCalls) throw Object.assign(new Error('call limit'), { code: 'RUN_LIMIT' });
    calls += 1;
    return client.generateJson(args);
  },
};
const catalog = await loadCatalog();
const stories = await draftMissingStories({
  catalog, stories: await loadStories(), gemini, force: process.argv.includes('--force'), log: (line) => console.log(line),
});
await saveStories(stories);
const audit = auditStories(stories, catalog);
console.log(`\nGemini呼び出し ${calls} / 上限 ${maxCalls}`);
console.log(`下書き ${audit.counts.draft} / 照合済み ${audit.counts.verified} / 却下 ${audit.counts.rejected}(全${audit.pairs}組)`);
console.log('`pnpm stories:review` で照合シートを出し、出典と見比べて verify / reject / edit で記録してください。');
