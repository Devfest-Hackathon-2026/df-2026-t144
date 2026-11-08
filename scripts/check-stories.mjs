// `pnpm stories:check`: fail if a verified story breaks the fact checks, and
// print the review numbers used in the pitch ("N本を照合し、誤りM件を却下").
import { loadCatalog } from '../server/routes.mjs';
import { auditStories, loadStories } from '../server/stories.mjs';

const audit = auditStories(await loadStories(), await loadCatalog());
console.log(`組み合わせ ${audit.pairs} / 下書き ${audit.counts.draft} / 照合済み ${audit.counts.verified} / 却下 ${audit.counts.rejected}`);
if (audit.errors.length) {
  for (const error of audit.errors) console.error(`- ${error}`);
  process.exit(1);
}
