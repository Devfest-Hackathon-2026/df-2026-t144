import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from './routes.mjs';
import { auditStories, draftMissingStories, loadStories } from './stories.mjs';

const catalog = await loadCatalog();
const ekidenStory = '1917年4月27日、三条大橋から東京・上野へ向けて日本初の駅伝が走り出しました。約508kmを23区間でつなぐリレーです。';

test('the committed stories file passes the audit', async () => {
  const audit = auditStories(await loadStories(), catalog);
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.pairs, catalog.spots.reduce((sum, spot) => sum + spot.topics.length, 0));
});

test('drafting fills only missing or rejected pairs and keeps reviewed work', async () => {
  const verified = { spotId: 'ekiden-monument', topicId: 'journey', text: ekidenStory, usedFactIds: ['f1', 'f2', 'f3'], reviewStatus: 'verified', model: 'm', generatedAt: '2026-11-08T00:00:00.000Z', problems: [], reviewedBy: 'Nozomu' };
  const rejected = { ...verified, topicId: 'history', reviewStatus: 'rejected' };
  let calls = 0;
  const gemini = { enabled: true, model: 'gemini-test', generateJson: async () => { calls += 1; return { text: ekidenStory, usedFactIds: ['f1', 'f2', 'f3'] }; } };
  const stories = await draftMissingStories({ catalog, stories: [verified, rejected], gemini, now: () => 0 });
  assert.equal(calls, auditStories(stories, catalog).pairs - 1);
  assert.deepEqual(stories.find((story) => story.topicId === 'journey' && story.spotId === 'ekiden-monument'), verified);
  const redrafted = stories.find((story) => story.topicId === 'history' && story.spotId === 'ekiden-monument');
  assert.equal(redrafted.reviewStatus, 'draft');
  assert.equal(redrafted.model, 'gemini-test');
});

test('audit rejects verified stories that fail fact checks or lack a reviewer', () => {
  const base = { spotId: 'ekiden-monument', topicId: 'journey', text: ekidenStory, usedFactIds: ['f1', 'f2', 'f3'], reviewStatus: 'verified', model: 'm', generatedAt: 'x', problems: [], reviewedBy: 'Nozomu' };
  assert.deepEqual(auditStories([base], catalog).errors, []);
  assert.equal(auditStories([base], catalog).counts.verified, 1);
  assert.match(auditStories([{ ...base, text: ekidenStory.replace('1917', '1918') }], catalog).errors.join(), /1918/);
  assert.match(auditStories([{ ...base, reviewedBy: '' }], catalog).errors.join(), /reviewedBy/);
  assert.match(auditStories([{ ...base, topicId: 'water' }], catalog).errors.join(), /topic not on this spot/);
  assert.match(auditStories([base, base], catalog).errors.join(), /duplicate/);
  assert.match(auditStories([{ ...base, reviewStatus: 'ok' }], catalog).errors.join(), /bad reviewStatus/);
  assert.deepEqual(auditStories([{ ...base, reviewStatus: 'draft', text: '短い' }], catalog).errors, []);
});
