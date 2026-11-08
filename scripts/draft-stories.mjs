// Draft topic-specific stories with Gemini: `pnpm stories:draft [--force]`.
// Needs GOOGLE_CLOUD_PROJECT and GEMINI_ACCESS_TOKEN (see .env.example), or
// run it in Cloud Shell. Every draft must be reviewed by a person afterwards.
import { createGemini } from '../server/gemini.mjs';
import { loadCatalog } from '../server/routes.mjs';
import { auditStories, draftMissingStories, loadStories, saveStories } from '../server/stories.mjs';

const gemini = createGemini();
if (!gemini.enabled) {
  console.error('Geminiが未設定です。.env に GOOGLE_CLOUD_PROJECT と GEMINI_ACCESS_TOKEN を入れてください。');
  process.exit(1);
}
const catalog = await loadCatalog();
const stories = await draftMissingStories({
  catalog, stories: await loadStories(), gemini, force: process.argv.includes('--force'), log: (line) => console.log(line),
});
await saveStories(stories);
const audit = auditStories(stories, catalog);
console.log(`\n下書き ${audit.counts.draft} / 照合済み ${audit.counts.verified} / 却下 ${audit.counts.rejected}(全${audit.pairs}組)`);
console.log('src/data/stories.json を開き、出典と照合して reviewStatus と reviewedBy を書いてください。');
