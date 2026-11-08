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
