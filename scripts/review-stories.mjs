// Review the Gemini drafts in src/data/stories.json without hand-editing JSON.
// `pnpm stories:review help` lists the commands.
import { writeFile } from 'node:fs/promises';
import { loadCatalog } from '../server/routes.mjs';
import { applyReview, auditStories, loadStories, reviewSheet, saveStories } from '../server/stories.mjs';

const HELP = `使い方:
  pnpm stories:review                       照合待ちの下書きを、事実と出典つきで表示する
  pnpm stories:review --all                 照合済み・却下も含めて表示する
  pnpm stories:review --out review.md       表示内容をMarkdownで保存する
  pnpm stories:review verify <キー>... --by 名前            照合済みにする(自動検査を通るものだけ)
  pnpm stories:review reject <キー> --by 名前 --note 理由   却下する(次の stories:draft で下書きし直す)
  pnpm stories:review edit <キー> --text 本文 [--facts f1,f2] [--by 名前]   本文を直す(下書きに戻る)
  pnpm stories:review reset <キー>          下書きに戻す
キーは「スポットID/視点ID」(例: ikedaya/history)。`;

const args = process.argv.slice(2);
const flag = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const positional = args.filter((value, index) => !value.startsWith('--') && !args[index - 1]?.startsWith('--'));
const [action, ...keys] = positional;

if (action === 'help') { console.log(HELP); process.exit(0); }
const catalog = await loadCatalog();
let stories = await loadStories();

if (!action) {
  const sheet = reviewSheet(stories, catalog, { all: args.includes('--all') });
  const out = flag('out');
  if (out) { await writeFile(out, `${sheet}\n`); console.log(`${out} に書き出しました。`); } else console.log(sheet);
} else {
  if (!keys.length) { console.error(`キーを指定してください。\n\n${HELP}`); process.exit(1); }
  try {
    for (const key of keys) {
      stories = applyReview(stories, catalog, key, action, {
        by: flag('by') ?? '', note: flag('note') ?? '', text: flag('text'),
        factIds: flag('facts')?.split(',').map((id) => id.trim()).filter(Boolean),
      });
      const story = stories.find((item) => `${item.spotId}/${item.topicId}` === key);
      console.log(`${key}: ${story.reviewStatus}${story.problems?.length && action === 'edit' ? `(自動検査: ${story.problems.join(' / ')})` : ''}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  await saveStories(stories);
}
const audit = auditStories(stories, catalog);
console.log(`\n組み合わせ ${audit.pairs} / 下書き ${audit.counts.draft} / 照合済み ${audit.counts.verified} / 却下 ${audit.counts.rejected}`);
