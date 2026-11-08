import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { matchTopicsByKeywords, pickStory, rankSpots, toggleTopic, topicScore } from '../src/interests.ts';
import { createDemoRoutes } from '../src/domain.ts';
import type { Destination, Spot, StoryVariant, Topic } from '../src/types.ts';

const catalog = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')) as { topics: Topic[]; spots: Spot[]; destinations: Destination[]; demoOrigin: Spot['coordinate'] };
const byId = (id: string) => catalog.spots.find((spot) => spot.id === id)!;

test('keyword matching is the same rule as the server fallback', () => {
  assert.deepEqual(matchTopicsByKeywords('水路が好き', catalog.topics), ['water']);
  assert.deepEqual(matchTopicsByKeywords('  ', catalog.topics), []);
  assert.deepEqual(matchTopicsByKeywords('お寺と橋の飾り', catalog.topics).sort(), ['craft', 'faith']);
});

test('ranking counts shared topics only and keeps catalog order on ties', () => {
  assert.equal(topicScore(byId('takase-ichino-funairi'), ['water', 'people']), 2);
  assert.deepEqual(rankSpots(catalog.spots, []).map((spot) => spot.id), catalog.spots.map((spot) => spot.id));
  const ranked = rankSpots(catalog.spots, ['journey']).map((spot) => spot.id);
  assert.equal(ranked[0], 'ekiden-monument');
  assert.deepEqual(ranked.slice(1), catalog.spots.map((spot) => spot.id).filter((id) => id !== 'ekiden-monument'));
});

test('topic toggle caps the selection at three and drops the oldest', () => {
  assert.deepEqual(toggleTopic([], 'water'), ['water']);
  assert.deepEqual(toggleTopic(['water'], 'water'), []);
  assert.deepEqual(toggleTopic(['a', 'b', 'c'], 'd'), ['b', 'c', 'd']);
});

test('only verified stories for the chosen topic replace the base story', () => {
  const spot = byId('ekiden-monument');
  const story = (topicId: string, reviewStatus: StoryVariant['reviewStatus']): StoryVariant => ({
    spotId: spot.id, topicId, text: `${topicId}-${reviewStatus}`, usedFactIds: ['f1'], reviewStatus, model: 'm', generatedAt: 'x', problems: [],
  });
  const stories = [story('journey', 'draft'), story('history', 'verified'), story('journey', 'rejected')];
  assert.deepEqual(pickStory(spot, ['journey'], stories), { text: spot.story, variant: null });
  assert.equal(pickStory(spot, ['journey', 'history'], stories).text, 'history-verified');
  assert.equal(pickStory(spot, [], stories).text, spot.story);
});

test('demo detour picks the spots that match the user and keeps walking order', () => {
  const cityHall = catalog.destinations.find((item) => item.id === 'city-hall')!;
  const plain = createDemoRoutes(cityHall, 5, catalog.spots, catalog.demoOrigin);
  assert.deepEqual(plain[1].spotIds, ['sanjo-giboshi', 'ikedaya']);
  const water = createDemoRoutes(cityHall, 5, catalog.spots, catalog.demoOrigin, ['water']);
  assert.deepEqual(water[1].spotIds, ['sanjo-giboshi', 'takase-ichino-funairi']);
  assert.equal(water[1].extraSeconds, plain[1].extraSeconds);
  const people = createDemoRoutes(cityHall, 5, catalog.spots, catalog.demoOrigin, ['people']);
  assert.deepEqual(people[1].spotIds, ['ikedaya', 'takase-ichino-funairi']);
});

// "最初の「？」を体験する" opens the first spot of the discovery route and does nothing without one.
test('every demo destination, budget and single topic has a discovery route with catalog spots', () => {
  const ids = new Set(catalog.spots.map((spot) => spot.id));
  for (const destination of catalog.destinations) {
    for (const budget of [5, 10] as const) {
      for (const topicIds of [[], ...catalog.topics.map((topic) => [topic.id])]) {
        const discovery = createDemoRoutes(destination, budget, catalog.spots, catalog.demoOrigin, topicIds).find((route) => route.kind === 'discovery');
        assert.ok(discovery && discovery.spotIds.length > 0, `${destination.id} +${budget} [${topicIds}]`);
        assert.ok(discovery.spotIds.every((id) => ids.has(id)));
      }
    }
  }
});
