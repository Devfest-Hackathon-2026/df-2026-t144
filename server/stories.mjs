// Pre-generated, human-reviewed stories (src/data/stories.json).
// Gemini drafts; a person checks each draft against the sources and sets
// reviewStatus to "verified" or "rejected". The app shows verified ones only.
import { readFile, writeFile } from 'node:fs/promises';
import { checkGeneratedText, draftStory } from './ai.mjs';

export const STORIES_URL = new URL('../src/data/stories.json', import.meta.url);
const STATUSES = new Set(['draft', 'verified', 'rejected']);

export async function loadStories(url = STORIES_URL) {
  try { return JSON.parse(await readFile(url, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function saveStories(stories, url = STORIES_URL) {
  await writeFile(url, `${JSON.stringify(stories, null, 2)}\n`);
}

/** Drafts every (spot, topic) pair that has no draft or verified story yet. */
export async function draftMissingStories({ catalog, stories, gemini, now = Date.now, force = false, log = () => {} }) {
  const result = [...stories];
  for (const spot of catalog.spots) {
    for (const topicId of spot.topics) {
      const topic = catalog.topics.find((item) => item.id === topicId);
      const index = result.findIndex((story) => story.spotId === spot.id && story.topicId === topicId);
      if (!topic || (index >= 0 && result[index].reviewStatus !== 'rejected' && !force)) continue;
      try {
        const draft = await draftStory(spot, topic, { gemini });
        const entry = {
          spotId: spot.id, topicId, text: draft.text, usedFactIds: draft.usedFactIds,
          reviewStatus: 'draft', model: gemini.model, generatedAt: new Date(now()).toISOString(), problems: draft.problems,
        };
        if (index >= 0) result[index] = entry; else result.push(entry);
        log(`${spot.id} / ${topicId}: ${draft.problems.length ? `要確認 (${draft.problems.join('; ')})` : 'ok'}`);
      } catch (error) {
        log(`${spot.id} / ${topicId}: 失敗 (${error?.code ?? error?.message})`);
      }
    }
  }
  return result;
}

/** "spotId/topicId", the key the review commands take. */
export const storyKey = (story) => `${story.spotId}/${story.topicId}`;

const checkStory = (story, spot) => checkGeneratedText({ text: story.text, usedFactIds: story.usedFactIds, facts: spot.facts, minChars: 60, maxChars: 220 });

/** Words that name another "?" (its spoilerWords) found in the text. A hint for the reviewer, not an error. */
export function otherSpotWords(story, catalog) {
  return catalog.spots.filter((spot) => spot.id !== story.spotId)
    .flatMap((spot) => spot.spoilerWords.filter((word) => story.text.includes(word)).map((word) => `${word}(${spot.name})`));
}

/** Markdown sheet that puts each draft next to the facts it used and their sources. */
export function reviewSheet(stories, catalog, { all = false } = {}) {
  const targets = stories.filter((story) => all || story.reviewStatus === 'draft');
  const lines = [
    '# 解説の照合シート', '',
    '本文を、下に並べた事実と出典に照らして読む。結果は `pnpm stories:review verify|reject|edit` で書き込む(使い方は `pnpm stories:review help`)。', '',
  ];
  if (!targets.length) lines.push(all ? '解説がまだありません。先に `pnpm stories:draft` を実行してください。' : '照合待ちの下書きはありません。');
  for (const story of targets) {
    const spot = catalog.spots.find((item) => item.id === story.spotId);
    const topic = catalog.topics.find((item) => item.id === story.topicId);
    if (!spot || !topic) { lines.push(`## ${storyKey(story)}`, '', 'カタログにないスポットか視点です。却下してください。', ''); continue; }
    const problems = checkStory(story, spot);
    const others = otherSpotWords(story, catalog);
    lines.push(`## ${storyKey(story)} ${spot.name} / 視点「${topic.label}」`, '');
    lines.push(`状態: ${story.reviewStatus}${story.reviewedBy ? `(${story.reviewedBy})` : ''} ／ ${[...story.text].length}字 ／ ${story.model}`, '');
    lines.push(`> ${story.text}`, '');
    lines.push(`自動検査: ${problems.length ? `通らない(${problems.join(' / ')})` : '通過'}`);
    if (others.length) lines.push(`ほかの「？」の名前: ${others.join('、')}(先に答えを明かしていないか読む)`);
    if (story.reviewNote) lines.push(`メモ: ${story.reviewNote}`);
    lines.push('', '使った事実:');
    for (const id of story.usedFactIds) {
      const fact = spot.facts.find((item) => item.id === id);
      const source = fact ? spot.sources[fact.sourceIndex] : undefined;
      lines.push(fact ? `- ${id}: ${fact.text}(出典: [${source?.title ?? '不明'}](${source?.url ?? ''}))` : `- ${id}: このスポットにない事実ID`);
    }
    const unused = spot.facts.filter((fact) => !story.usedFactIds.includes(fact.id));
    if (unused.length) lines.push('', `使っていない事実: ${unused.map((fact) => `${fact.id} ${fact.text}`).join(' ／ ')}`);
    lines.push('', '- [ ] 事実にない年・数・人物・出来事・評価を足していない',
      '- [ ] 伝承や「〜とされる」を、言い切りに変えていない',
      `- [ ] 「${topic.label}」の視点で書けている`,
      '- [ ] 現地で読んで意味が通る', '');
  }
  return lines.join('\n');
}

/**
 * Applies one review decision and returns the new list. Throws with a message
 * for the reviewer when the decision cannot be recorded.
 * - verify: needs a reviewer and a text that passes the automatic checks
 * - reject: needs a reviewer and a reason; `pnpm stories:draft` redrafts it
 * - edit: replaces the text (and optionally the fact IDs) and keeps it a draft
 * - reset: back to draft
 */
export function applyReview(stories, catalog, key, action, { by = '', note = '', text, factIds } = {}) {
  const index = stories.findIndex((story) => storyKey(story) === key);
  if (index < 0) throw new Error(`${key} の解説がありません。キーは「スポットID/視点ID」です。`);
  const story = stories[index];
  const spot = catalog.spots.find((item) => item.id === story.spotId);
  if (!spot) throw new Error(`${key} はカタログにないスポットです。`);
  const reviewer = by.trim();
  let next;
  if (action === 'verify' || action === 'reject') {
    if (!reviewer) throw new Error('--by に照合した人の名前を入れてください。');
    if (action === 'reject' && !note.trim()) throw new Error('却下の理由を --note に書いてください。');
    if (action === 'verify') {
      const problems = checkStory(story, spot);
      if (problems.length) throw new Error(`${key} は自動検査を通らないため照合済みにできません: ${problems.join(' / ')}`);
    }
    next = { ...story, reviewStatus: action === 'verify' ? 'verified' : 'rejected', reviewedBy: reviewer, ...(note.trim() ? { reviewNote: note.trim() } : {}) };
  } else if (action === 'edit') {
    if (typeof text !== 'string' || !text.trim()) throw new Error('--text に新しい本文を入れてください。');
    const edited = { ...story, text: text.trim(), usedFactIds: factIds ?? story.usedFactIds };
    const { reviewedBy, ...rest } = edited;
    next = { ...rest, reviewStatus: 'draft', problems: checkStory(edited, spot), reviewNote: [story.reviewNote, `本文を人が修正${reviewer ? `(${reviewer})` : ''}`].filter(Boolean).join(' / ') };
  } else if (action === 'reset') {
    const { reviewedBy, reviewNote, ...rest } = story;
    next = { ...rest, reviewStatus: 'draft' };
  } else {
    throw new Error(`知らない操作です: ${action}`);
  }
  return stories.map((item, position) => (position === index ? next : item));
}

/** Structural and fact checks over the whole file, plus the numbers for the pitch. */
export function auditStories(stories, catalog) {
  const errors = [];
  const counts = { draft: 0, verified: 0, rejected: 0 };
  const seen = new Set();
  for (const [index, story] of stories.entries()) {
    const label = `#${index} ${story?.spotId}/${story?.topicId}`;
    const spot = catalog.spots.find((item) => item.id === story?.spotId);
    if (!spot) { errors.push(`${label}: unknown spot`); continue; }
    if (!spot.topics.includes(story.topicId)) errors.push(`${label}: topic not on this spot`);
    if (!STATUSES.has(story.reviewStatus)) { errors.push(`${label}: bad reviewStatus`); continue; }
    const key = `${story.spotId}/${story.topicId}`;
    if (seen.has(key)) errors.push(`${label}: duplicate`);
    seen.add(key);
    counts[story.reviewStatus] += 1;
    if (story.reviewStatus === 'verified') {
      const problems = checkGeneratedText({ text: story.text, usedFactIds: story.usedFactIds, facts: spot.facts, minChars: 60, maxChars: 220 });
      if (problems.length) errors.push(`${label}: verified but ${problems.join('; ')}`);
      if (typeof story.reviewedBy !== 'string' || !story.reviewedBy.trim()) errors.push(`${label}: verified without reviewedBy`);
    }
  }
  const reviewed = counts.verified + counts.rejected;
  return { errors, counts, reviewed, pairs: catalog.spots.reduce((sum, spot) => sum + spot.topics.length, 0) };
}
