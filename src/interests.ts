import type { Spot, StoryVariant, Topic } from './types.ts';

/** One-tap samples, so a first-time visitor sees Gemini work without typing. Each also maps to a topic by keywords (tested). */
export const INTEREST_EXAMPLES = ['水路が好き', '幕末の話', '橋の飾り', 'お寺めぐり'];

/**
 * The "?" to suggest after a discovery: the first undiscovered spot of `pool`
 * (the walking route, or the ranked list) other than the one just found.
 */
export function nextUndiscovered<T extends { id: string }>(pool: T[], discoveredIds: string[], exceptId?: string): T | null {
  return pool.find((spot) => spot.id !== exceptId && !discoveredIds.includes(spot.id)) ?? null;
}

// Same rule as server/ai.mjs matchTopicsByKeywords: used when the server is
// not connected or Gemini is unavailable.
export function matchTopicsByKeywords(text: string, topics: Topic[]): string[] {
  const value = text.normalize('NFKC').trim().toLowerCase();
  if (!value) return [];
  return topics
    .map((topic, index) => ({ id: topic.id, index, hits: topic.keywords.filter((word) => value.includes(word.toLowerCase())).length }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .slice(0, 3)
    .map((item) => item.id);
}

/** Number of the user's topics this spot shares. The ranking rule is this count only, so it can be explained. */
export function topicScore(spot: Pick<Spot, 'topics'>, topicIds: string[]): number {
  return (spot.topics ?? []).filter((id) => topicIds.includes(id)).length;
}

/** Stable: spots with equal scores keep catalog order. */
export function rankSpots<T extends Pick<Spot, 'topics'>>(spots: T[], topicIds: string[]): T[] {
  if (topicIds.length === 0) return spots;
  return spots.map((spot, index) => ({ spot, index, score: topicScore(spot, topicIds) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.spot);
}

export function toggleTopic(selected: string[], id: string, max = 3): string[] {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  return selected.length >= max ? [...selected.slice(1), id] : [...selected, id];
}

/** The verified story for the user's first matching topic, else the base story. */
export function pickStory(spot: Pick<Spot, 'id' | 'story'>, topicIds: string[], stories: StoryVariant[]): { text: string; variant: StoryVariant | null } {
  for (const topicId of topicIds) {
    const variant = stories.find((story) => story.spotId === spot.id && story.topicId === topicId && story.reviewStatus === 'verified');
    if (variant) return { text: variant.text, variant };
  }
  return { text: spot.story, variant: null };
}
