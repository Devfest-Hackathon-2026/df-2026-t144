import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from './routes.mjs';
import { applyReview, auditStories, draftMissingStories, loadStories, otherSpotWords, reviewSheet } from './stories.mjs';

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

test('review sheet puts each draft next to its facts, sources and warnings', () => {
  const draft = { spotId: 'ekiden-monument', topicId: 'journey', text: ekidenStory, usedFactIds: ['f1', 'f2', 'f3'], reviewStatus: 'draft', model: 'm', generatedAt: 'x', problems: [] };
  const verified = { ...draft, topicId: 'history', reviewStatus: 'verified', reviewedBy: 'Nozomu' };
  const sheet = reviewSheet([draft, verified], catalog);
  assert.match(sheet, /## ekiden-monument\/journey/);
  assert.doesNotMatch(sheet, /ekiden-monument\/history/);
  assert.match(sheet, /f3: 東海道駅伝徒歩競争の全行程は約508km/);
  assert.match(sheet, /hi105\.html/);
  assert.match(sheet, /使っていない事実: f4/);
  assert.match(sheet, /自動検査: 通過/);
  // The start point is also another "?"'s name: flagged for a person to judge, not refused.
  assert.deepEqual(otherSpotWords(draft, catalog), ['三条大橋(三条大橋の擬宝珠)']);
  assert.match(reviewSheet([{ ...draft, text: ekidenStory.replace('1917', '1918') }], catalog), /自動検査: 通らない\(numbers not in used facts: 1918\)/);
  assert.match(reviewSheet([verified], catalog, { all: true }), /状態: verified\(Nozomu\)/);
  assert.match(reviewSheet([], catalog), /照合待ちの下書きはありません/);
});

test('review commands record decisions and refuse ones the checks would fail', () => {
  const draft = { spotId: 'ekiden-monument', topicId: 'journey', text: ekidenStory, usedFactIds: ['f1', 'f2', 'f3'], reviewStatus: 'draft', model: 'm', generatedAt: 'x', problems: [] };
  const key = 'ekiden-monument/journey';
  const verified = applyReview([draft], catalog, key, 'verify', { by: 'Nozomu' });
  assert.equal(verified[0].reviewStatus, 'verified');
  assert.deepEqual(auditStories(verified, catalog).errors, []);
  assert.equal(draft.reviewStatus, 'draft', 'input is not mutated');
  assert.throws(() => applyReview([draft], catalog, key, 'verify', {}), /--by/);
  assert.throws(() => applyReview([{ ...draft, text: ekidenStory.replace('1917', '1918') }], catalog, key, 'verify', { by: 'Nozomu' }), /1918/);
  assert.throws(() => applyReview([draft], catalog, 'ekiden-monument/water', 'verify', { by: 'Nozomu' }), /ありません/);
  assert.throws(() => applyReview([draft], catalog, key, 'reject', { by: 'Nozomu' }), /--note/);
  const rejected = applyReview([draft], catalog, key, 'reject', { by: 'Nozomu', note: '上野を東京駅と誤記' });
  assert.equal(rejected[0].reviewNote, '上野を東京駅と誤記');
  const edited = applyReview(verified, catalog, key, 'edit', { text: `${ekidenStory}2002年に碑が建ちました。`, by: 'Nozomu' });
  assert.equal(edited[0].reviewStatus, 'draft');
  assert.equal(edited[0].reviewedBy, undefined);
  assert.match(edited[0].problems.join(), /2002/, 'a year from an unused fact is caught');
  const fixed = applyReview(edited, catalog, key, 'edit', { text: edited[0].text, factIds: ['f1', 'f2', 'f3', 'f4'] });
  assert.deepEqual(fixed[0].problems, []);
  assert.equal(applyReview(fixed, catalog, key, 'verify', { by: 'Nozomu' })[0].reviewStatus, 'verified');
  assert.equal(applyReview(verified, catalog, key, 'reset')[0].reviewStatus, 'draft');
  assert.equal(applyReview(verified, catalog, key, 'reset')[0].reviewedBy, undefined);
});
