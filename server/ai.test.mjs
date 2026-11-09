import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { checkGeneratedText, createTeaser, draftStory, interpretInterest, matchTopicsByKeywords, recognizeSpot } from './ai.mjs';
import { createGemini, vertexEndpoint } from './gemini.mjs';
import { createHandler, japanDay } from './index.mjs';
import { loadCatalog } from './routes.mjs';
import { createStaticHandler } from './static.mjs';

const catalog = await loadCatalog();
const OPEN = '2099-12-31T23:59:59+09:00'; // paid-API window that has not ended
const fakeGemini = (respond) => {
  const calls = [];
  return { enabled: true, model: 'test-model', calls, generateJson: async (args) => { calls.push(args); return respond(args); } };
};

test('catalog facts, topics and notes are consistent', () => {
  const topicIds = new Set(catalog.topics.map((topic) => topic.id));
  for (const spot of catalog.spots) {
    assert.ok(spot.facts.length >= 3, spot.id);
    assert.equal(new Set(spot.facts.map((fact) => fact.id)).size, spot.facts.length);
    for (const fact of spot.facts) assert.ok(spot.sources[fact.sourceIndex], `${spot.id}:${fact.id} source`);
    assert.ok(spot.topics.length > 0 && spot.topics.every((id) => topicIds.has(id)), spot.id);
    for (const id of spot.relatedSpotIds) assert.ok(spot.relatedNotes[id], `${spot.id} -> ${id} note`);
    assert.ok(spot.spoilerWords.length > 0);
    // The card subtitle must fit one line on a 360px-wide phone.
    assert.ok(typeof spot.tagline === 'string' && spot.tagline.length > 0 && spot.tagline.length <= 14, `${spot.id} tagline`);
  }
});

test('keyword fallback maps everyday words to fixed topics', () => {
  assert.deepEqual(matchTopicsByKeywords('水路が好き', catalog.topics), ['water']);
  assert.deepEqual(matchTopicsByKeywords('ＥＫＩＤＥＮ　駅伝とお寺', catalog.topics).sort(), ['faith', 'journey']);
  assert.deepEqual(matchTopicsByKeywords('', catalog.topics), []);
  assert.deepEqual(matchTopicsByKeywords('量子力学', catalog.topics), []);
});

test('generated text is rejected for invented numbers, unknown facts, spoilers and length', () => {
  const facts = [{ id: 'f1', text: '1917年に駅伝が始まった。' }, { id: 'f2', text: '全行程は約508km。' }];
  const ok = { text: '1917年、この場所から約508kmの挑戦が始まりました。', usedFactIds: ['f1', 'f2'], facts, minChars: 10, maxChars: 80 };
  assert.deepEqual(checkGeneratedText(ok), []);
  assert.match(checkGeneratedText({ ...ok, text: '1918年、この場所から長い挑戦が始まりました。' }).join(), /1918/);
  assert.match(checkGeneratedText({ ...ok, text: '1917年、この場所から約508kmの挑戦。', usedFactIds: ['f1'] }).join(), /508/);
  assert.match(checkGeneratedText({ ...ok, usedFactIds: ['f9'] }).join(), /unknown/);
  assert.match(checkGeneratedText({ ...ok, usedFactIds: [] }).join(), /no usedFactIds/);
  assert.match(checkGeneratedText({ ...ok, spoilerWords: ['駅伝'], text: '1917年、駅伝が約508km先へ。' }).join(), /reveals/);
  assert.match(checkGeneratedText({ ...ok, text: '短い' }).join(), /length/);
  assert.match(checkGeneratedText({ ...ok, text: '1917年の話は https://example.com で約508km' }).join(), /URL/);
  assert.match(checkGeneratedText({ ...ok, facts: [{ id: 'f1', text: '23区間に分かれていた。' }], usedFactIds: ['f1'], text: '3日間かけて走る、長いリレーの物語です。' }).join(), /numbers not in used facts: 3/);
  assert.deepEqual(checkGeneratedText({ ...ok, facts: [{ id: 'f1', text: '全行程は約１，０００ｍ。' }], usedFactIds: ['f1'], text: '全部で約1000mの道のりを歩きます。' }), []);
});

test('interest uses Gemini topics, drops unknown tags and unsafe replies, and falls back on failure', async () => {
  const gemini = fakeGemini(() => ({ topicIds: ['water', 'made-up', 'water', 'people'], reply: '水の流れを追いかけましょう。' }));
  assert.deepEqual(await interpretInterest({ text: '運河の仕組み' }, { catalog, gemini }), { topicIds: ['water', 'people'], reply: '水の流れを追いかけましょう。', source: 'gemini' });
  assert.match(gemini.calls[0].prompt, /運河の仕組み/);
  assert.deepEqual(gemini.calls[0].schema.properties.topicIds.items.enum, catalog.topics.map((topic) => topic.id));

  const spoiler = fakeGemini(() => ({ topicIds: ['history'], reply: '池田屋へ行きましょう' }));
  assert.equal((await interpretInterest({ text: '幕末' }, { catalog, gemini: spoiler })).reply, null);

  const broken = fakeGemini(() => { throw new Error('down'); });
  assert.deepEqual(await interpretInterest({ text: '水路が好き' }, { catalog, gemini: broken }), { topicIds: ['water'], reply: null, source: 'keywords' });
  assert.deepEqual(await interpretInterest({ text: '水路' }, { catalog, gemini: { enabled: false } }), { topicIds: ['water'], reply: null, source: 'keywords' });
  await assert.rejects(interpretInterest({ text: 'あ'.repeat(81) }, { catalog }), { code: 'INVALID_INTEREST' });
  await assert.rejects(interpretInterest({ text: '   ' }, { catalog }), { code: 'INVALID_INTEREST' });
});

test('teaser keeps the next spot hidden and only uses its facts', async () => {
  const input = { fromSpotId: 'sanjo-giboshi', toSpotId: 'ekiden-monument', topicIds: ['journey'] };
  const good = fakeGemini(() => ({ text: 'この橋のたもとは、1917年に始まった約508kmのリレーの出発点でした。', usedFactIds: ['ekiden-monument:f1', 'ekiden-monument:f3'] }));
  const result = await createTeaser(input, { catalog, gemini: good });
  assert.equal(result.source, 'gemini');
  assert.deepEqual(result.usedFactIds, ['ekiden-monument:f1', 'ekiden-monument:f3']);
  // The next spot's facts necessarily contain its name; the output check is what keeps it hidden.
  assert.match(good.calls[0].prompt, /次のスポット\(名前は伏せる\):\n- ekiden-monument:f1/);
  assert.match(good.calls[0].system, /名前・施設名/);
  assert.match(good.calls[0].prompt, /旅と道/);

  const fixed = catalog.spots.find((spot) => spot.id === 'sanjo-giboshi').relatedNotes['ekiden-monument'];
  for (const output of [
    { text: '橋のたもとに駅伝の始まりを伝える石碑があります。', usedFactIds: ['ekiden-monument:f4'] },
    { text: 'この橋のたもとは、1920年に始まった長いリレーの出発点でした。', usedFactIds: ['ekiden-monument:f1'] },
    { text: 'この橋のたもとから、長いリレーが始まりました。', usedFactIds: ['zuisenji:f1'] },
  ]) {
    assert.deepEqual(await createTeaser(input, { catalog, gemini: fakeGemini(() => output) }), { text: fixed, usedFactIds: [], source: 'fixed' });
  }
  assert.equal((await createTeaser(input, { catalog, gemini: fakeGemini(() => { throw new Error('down'); }) })).source, 'fixed');
  await assert.rejects(createTeaser({ fromSpotId: 'ikedaya', toSpotId: 'zuisenji' }, { catalog }), { code: 'INVALID_SPOTS' });
});

test('photo recognition matches by transcribed text, never tells Gemini the answer, and rejects bad images', async () => {
  const image = 'A'.repeat(400);
  const seen = fakeGemini(() => ({ texts: ['池田屋騒動', '之址'], scene: '石碑' }));
  const hit = await recognizeSpot({ spotId: 'ikedaya', image, mimeType: 'image/jpeg' }, { catalog, gemini: seen });
  assert.deepEqual(hit, { matched: true, matchedWord: '池田屋', readText: '池田屋騒動 之址', scene: '石碑' });
  assert.deepEqual(seen.calls[0].images, [{ mimeType: 'image/jpeg', data: image }]);
  assert.ok(!`${seen.calls[0].system}${seen.calls[0].prompt}`.includes('池田屋'), 'the expected spot is not revealed to Gemini');

  const oldForm = await recognizeSpot({ spotId: 'sanjo-giboshi', image }, { catalog, gemini: fakeGemini(() => ({ texts: ['三 條 大 橋'], scene: '橋' })) });
  assert.equal(oldForm.matched, true);
  const miss = await recognizeSpot({ spotId: 'zuisenji', image }, { catalog, gemini: fakeGemini(() => ({ texts: ['池田屋騒動之址'], scene: '石碑' })) });
  assert.equal(miss.matched, false);
  assert.equal(miss.readText, '池田屋騒動之址');
  const empty = await recognizeSpot({ spotId: 'ikedaya', image }, { catalog, gemini: fakeGemini(() => ({ texts: [], scene: '室内の床' })) });
  assert.deepEqual(empty, { matched: false, matchedWord: null, readText: null, scene: '室内の床' });

  for (const bad of [{ spotId: 'ikedaya', image: 'short' }, { spotId: 'ikedaya', image: `${image}<script>` }, { spotId: 'ikedaya', image, mimeType: 'image/gif' }, { spotId: 'ikedaya', image: 'A'.repeat(2_800_004) }]) {
    await assert.rejects(recognizeSpot(bad, { catalog, gemini: seen }), { code: 'INVALID_IMAGE' });
  }
  await assert.rejects(recognizeSpot({ spotId: 'nowhere', image }, { catalog, gemini: seen }), { code: 'INVALID_SPOT' });
  await assert.rejects(recognizeSpot({ spotId: 'ikedaya', image }, { catalog, gemini: { enabled: false } }), { code: 'NOT_CONFIGURED' });
  await assert.rejects(recognizeSpot({ spotId: 'ikedaya', image }, { catalog, gemini: fakeGemini(() => { throw new Error('down'); }) }), { code: 'GEMINI_UNAVAILABLE' });
});

test('recognize endpoint accepts a photo-sized body while other endpoints keep the small limit', async () => {
  const gemini = fakeGemini(() => ({ texts: ['駅伝発祥の地'], scene: '石碑' }));
  const handler = createHandler({ catalog, env: { PAID_API_UNTIL: OPEN }, gemini });
  const big = { spotId: 'ekiden-monument', image: 'A'.repeat(200_000), mimeType: 'image/jpeg' };
  const result = await invoke(handler, { path: '/v1/recognize', body: big });
  assert.equal(result.status, 200);
  assert.equal(result.json.matched, true);
  assert.equal((await invoke(handler, { path: '/v1/interests', body: { text: 'x'.repeat(5000) } })).status, 413);
});

test('Gemini client sends photos as inline data next to the prompt', async () => {
  let body;
  const gemini = createGemini({ env: { GOOGLE_CLOUD_PROJECT: 'michi-demo', GEMINI_ACCESS_TOKEN: 't', PAID_API_UNTIL: OPEN }, fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"texts":[],"scene":""}' }] } }] }) }; } });
  await gemini.generateJson({ system: 's', prompt: 'p', schema: {}, images: [{ mimeType: 'image/png', data: 'QUJD' }] });
  assert.deepEqual(body.contents[0].parts, [{ text: 'p' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }]);
});

test('story drafts report problems instead of hiding them', async () => {
  const spot = catalog.spots.find((item) => item.id === 'ekiden-monument');
  const topic = catalog.topics.find((item) => item.id === 'journey');
  const draft = await draftStory(spot, topic, { gemini: fakeGemini(() => ({ text: '1917年4月、三条大橋から東京・上野へ向けて日本初の駅伝が走り出しました。約508kmを23区間でつなぐ3日間のリレーです。', usedFactIds: ['f1', 'f2', 'f3'] })) });
  assert.match(draft.problems.join(), /3/);
  const clean = await draftStory(spot, topic, { gemini: fakeGemini(() => ({ text: '1917年4月27日、三条大橋から東京・上野へ向けて日本初の駅伝が走り出しました。約508kmを23区間でつなぐリレーです。', usedFactIds: ['f1', 'f2', 'f3'] })) });
  assert.deepEqual(clean.problems, []);
});

test('Gemini client calls the Vertex AI endpoint with a metadata-server token and parses JSON', async () => {
  assert.equal(vertexEndpoint({ project: 'michi-demo', location: 'global', model: 'gemini-3.8-flash' }),
    'https://aiplatform.googleapis.com/v1/projects/michi-demo/locations/global/publishers/google/models/gemini-3.8-flash:generateContent');
  assert.match(vertexEndpoint({ project: 'p-12345', location: 'asia-northeast1', model: 'm' }), /^https:\/\/asia-northeast1-aiplatform\.googleapis\.com\//);
  assert.equal(createGemini({ env: {} }).enabled, false);

  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/service-accounts/default/token')) return { ok: true, json: async () => ({ access_token: 'token-1', expires_in: 3600 }) };
    if (url.endsWith('/project/project-id')) return { ok: true, text: async () => 'michi-demo\n' };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"topicIds":["water"]' }, { text: ',"reply":"ok"}' }] } }] }) };
  };
  const gemini = createGemini({ env: { K_SERVICE: 'michi', PAID_API_UNTIL: OPEN }, fetchImpl, now: () => 0 });
  assert.equal(gemini.model, 'gemini-3.8-flash');
  assert.deepEqual(await gemini.generateJson({ system: 's', prompt: 'p', schema: { type: 'OBJECT' } }), { topicIds: ['water'], reply: 'ok' });
  await gemini.generateJson({ system: 's', prompt: 'p', schema: { type: 'OBJECT' } });
  const calls = requests.filter((request) => request.url.includes('aiplatform'));
  assert.equal(calls.length, 2);
  assert.equal(requests.filter((request) => request.url.endsWith('/token')).length, 1, 'token is cached');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
  assert.equal(calls[0].options.redirect, 'error');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.maxOutputTokens, 2048);
  assert.deepEqual(body.contents[0].parts, [{ text: 'p' }]);

  const failing = createGemini({ env: { K_SERVICE: 'michi', GOOGLE_CLOUD_PROJECT: 'michi-demo', GEMINI_ACCESS_TOKEN: 't', PAID_API_UNTIL: OPEN }, fetchImpl: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(failing.generateJson({ system: 's', prompt: 'p', schema: {} }), { code: 'GEMINI_UNAVAILABLE' });
  const prose = createGemini({ env: { GOOGLE_CLOUD_PROJECT: 'michi-demo', GEMINI_ACCESS_TOKEN: 't', PAID_API_UNTIL: OPEN }, fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) }) });
  assert.equal(prose.enabled, true);
  await assert.rejects(prose.generateJson({ system: 's', prompt: 'p', schema: {} }), { code: 'INVALID_OUTPUT' });
});

async function invoke(handler, { body, origin, host, method = 'POST', path: url, contentType = 'application/json' }) {
  const request = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}))]);
  request.headers = { 'content-type': contentType, ...(origin ? { origin } : {}), ...(host ? { host } : {}) };
  request.method = method;
  request.url = url;
  const chunks = [];
  const response = Object.assign(new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }), {
    headers: {}, status: null,
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
  });
  await handler(request, response);
  if (!response.writableFinished) await new Promise((resolve) => response.once('finish', resolve));
  const text = Buffer.concat(chunks).toString('utf8');
  return { ...response, text, json: text && response.headers['Content-Type']?.startsWith('application/json') ? JSON.parse(text) : null };
}

test('AI endpoints answer through HTTP, respect the daily Gemini ceiling and accept same-origin web', async () => {
  const gemini = fakeGemini(() => ({ topicIds: ['craft'], reply: '細部に目が行くタイプですね。' }));
  const handler = createHandler({ catalog, env: { MAX_GEMINI_CALLS_PER_DAY: '1', PAID_API_UNTIL: OPEN }, gemini });
  const first = await invoke(handler, { path: '/v1/interests', body: { text: '建物の飾り' }, origin: 'https://michi-abc.a.run.app', host: 'michi-abc.a.run.app' });
  assert.equal(first.status, 200);
  assert.equal(first.json.source, 'gemini');
  const second = await invoke(handler, { path: '/v1/interests', body: { text: '建物の飾り' } });
  assert.deepEqual(second.json, { topicIds: ['craft'], reply: null, source: 'keywords' });
  assert.equal(gemini.calls.length, 1);

  const teaser = await invoke(handler, { path: '/v1/teaser', body: { fromSpotId: 'zuisenji', toSpotId: 'takase-ichino-funairi' } });
  assert.equal(teaser.status, 200);
  assert.equal(teaser.json.source, 'fixed');
  assert.equal((await invoke(handler, { path: '/v1/interests', body: { text: 'x' }, origin: 'https://evil.example', host: 'michi-abc.a.run.app' })).status, 403);
  const health = await invoke(handler, { method: 'GET', path: '/health' });
  assert.equal(health.json.geminiConfigured, true);
  assert.deepEqual((await invoke(handler, { method: 'GET', path: '/v1/config' })).json, { mapsApiKey: null });
  const withKey = createHandler({ catalog, env: { GOOGLE_MAPS_BROWSER_KEY: 'browser-key', PAID_API_UNTIL: OPEN }, gemini: { enabled: false } });
  assert.deepEqual((await invoke(withKey, { method: 'GET', path: '/v1/config' })).json, { mapsApiKey: 'browser-key' });
});

test('paid window: Gemini and the Maps key stop right after PAID_API_UNTIL, and fixed text keeps working', async () => {
  const until = '2026-11-14T23:59:59+09:00';
  const deadline = Date.parse(until);
  let clock = deadline;
  const gemini = fakeGemini(() => ({ topicIds: ['craft'], reply: '細部に目が行くタイプですね。' }));
  const handler = createHandler({ catalog, env: { PAID_API_UNTIL: until, GOOGLE_MAPS_BROWSER_KEY: 'browser-key' }, gemini, now: () => clock });
  // The last millisecond is still inside the window.
  assert.equal((await invoke(handler, { path: '/v1/interests', body: { text: '建物の飾り' } })).json.source, 'gemini');
  assert.equal((await invoke(handler, { method: 'GET', path: '/v1/config' })).json.mapsApiKey, 'browser-key');

  clock = deadline + 1;
  assert.deepEqual((await invoke(handler, { path: '/v1/interests', body: { text: '建物の飾り' } })).json, { topicIds: ['craft'], reply: null, source: 'keywords' });
  assert.equal((await invoke(handler, { path: '/v1/teaser', body: { fromSpotId: 'zuisenji', toSpotId: 'takase-ichino-funairi' } })).json.source, 'fixed');
  const image = 'A'.repeat(200);
  assert.equal((await invoke(handler, { path: '/v1/recognize', body: { spotId: 'ikedaya', image } })).status, 503);
  assert.equal(gemini.calls.length, 1, 'no Gemini call after the deadline');
  assert.deepEqual((await invoke(handler, { method: 'GET', path: '/v1/config' })).json, { mapsApiKey: null });
  const health = (await invoke(handler, { method: 'GET', path: '/health' })).json;
  assert.equal(health.geminiConfigured, false);
  assert.equal(health.paidApiUntil, '2026-11-14T14:59:59.000Z');
});

test('paid window fails closed when PAID_API_UNTIL is missing, malformed or has no UTC offset', async () => {
  for (const value of [undefined, '', 'tomorrow', '2026-11-14', '2026-11-14T23:59:59', '2026-13-40T99:00:00+09:00']) {
    const gemini = fakeGemini(() => ({ topicIds: ['craft'], reply: 'x' }));
    const handler = createHandler({ catalog, env: { PAID_API_UNTIL: value, GOOGLE_MAPS_BROWSER_KEY: 'k' }, gemini });
    assert.equal((await invoke(handler, { path: '/v1/interests', body: { text: '建物の飾り' } })).json.source, 'keywords', String(value));
    assert.equal((await invoke(handler, { method: 'GET', path: '/v1/config' })).json.mapsApiKey, null);
    assert.equal(gemini.calls.length, 0);
  }
  // The Gemini client itself refuses too, so scripts are covered without the server.
  let fetched = 0;
  const env = { GOOGLE_CLOUD_PROJECT: 'michi-demo', GEMINI_ACCESS_TOKEN: 't' };
  assert.equal(createGemini({ env, fetchImpl: async () => { fetched += 1; } }).enabled, false);
  let clock = 0;
  const expiring = createGemini({ env: { ...env, PAID_API_UNTIL: '1970-01-01T00:00:01Z' }, fetchImpl: async () => { fetched += 1; }, now: () => clock });
  assert.equal(expiring.enabled, true);
  clock = 1001;
  await assert.rejects(expiring.generateJson({ system: 's', prompt: 'p', schema: {} }), { code: 'PAID_API_CLOSED' });
  await assert.rejects(createGemini({ env: { ...env, PAID_API_UNTIL: OPEN } }).generateJson({ system: 's', prompt: 'p', schema: {}, images: [{}, {}] }), { code: 'INVALID_INPUT' });
  assert.equal(fetched, 0);
});

test('daily Gemini ceiling defaults to 50 and env cannot raise it', async () => {
  const { dailyLimit } = await import('./paid.mjs');
  assert.equal(dailyLimit(undefined), 50);
  assert.equal(dailyLimit('500'), 50);
  assert.equal(dailyLimit('10'), 10);
  assert.equal(dailyLimit('0'), 50);
  const gemini = fakeGemini(() => ({ topicIds: ['craft'], reply: '細部に目が行くタイプですね。' }));
  // The interest share is raised to its maximum (also capped at 50) so the overall ceiling is what stops it.
  const handler = createHandler({ catalog, env: { PAID_API_UNTIL: OPEN, MAX_GEMINI_CALLS_PER_DAY: '9999', MAX_INTEREST_CALLS_PER_DAY: '9999', MAX_AI_REQUESTS_PER_MINUTE: '300' }, gemini, now: () => 0 });
  const sources = [];
  for (let index = 0; index < 51; index += 1) {
    sources.push((await invoke(handler, { path: '/v1/interests', body: { text: '建物の飾り' } })).json.source);
  }
  assert.equal(gemini.calls.length, 50);
  assert.equal(sources[49], 'gemini');
  assert.equal(sources[50], 'keywords');
});

test('static handler serves the web export, falls back to index.html and never escapes its root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'michi-web-'));
  await mkdir(path.join(root, '_expo', 'static', 'js'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>MICHI?</title>');
  await writeFile(path.join(root, '_expo', 'static', 'js', 'app-1a2b.js'), 'console.log(1)');
  await writeFile(path.join(path.dirname(root), 'secret.txt'), 'secret');
  assert.equal(await createStaticHandler(undefined), null);
  assert.equal(await createStaticHandler(path.join(root, 'missing')), null);
  const handler = createHandler({ catalog, env: {}, gemini: { enabled: false }, serveStatic: await createStaticHandler(root) });
  const read = (url) => invoke(handler, { method: 'GET', path: url });
  const js = await read('/_expo/static/js/app-1a2b.js');
  assert.equal(js.headers['Content-Type'], 'text/javascript; charset=utf-8');
  assert.match(js.headers['Cache-Control'], /immutable/);
  assert.equal((await read('/book')).headers['Content-Type'], 'text/html; charset=utf-8');
  const escape = await read('/../secret.txt');
  assert.equal(escape.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal((await read('/%2e%2e/secret.txt')).headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal((await invoke(handler, { method: 'GET', path: '/health' })).json.ok, true);
});

test('teaser and interest calls have their own daily share, so photo reading keeps its calls', async () => {
  const gemini = fakeGemini((args) => {
    if (args.images?.length) return { texts: ['池田屋騒動之址'], scene: '石碑' };
    if (args.schema?.properties?.topicIds) return { topicIds: ['history'], reply: '歴史の話をたどりましょう。' };
    return { text: 'この橋のたもとは、長いリレーの出発点でした。', usedFactIds: ['ekiden-monument:f2'] };
  });
  const handler = createHandler({ catalog, env: { PAID_API_UNTIL: OPEN, MAX_GEMINI_CALLS_PER_DAY: '4', MAX_TEASER_CALLS_PER_DAY: '2', MAX_INTEREST_CALLS_PER_DAY: '1' }, gemini });
  const teaser = async () => (await invoke(handler, { path: '/v1/teaser', body: { fromSpotId: 'sanjo-giboshi', toSpotId: 'ekiden-monument' } })).json.source;
  const interest = async () => (await invoke(handler, { path: '/v1/interests', body: { text: '幕末の話' } })).json.source;
  const photo = () => invoke(handler, { path: '/v1/recognize', body: { spotId: 'ikedaya', image: 'A'.repeat(400) } });

  assert.deepEqual([await teaser(), await teaser(), await teaser()], ['gemini', 'gemini', 'fixed']);
  assert.deepEqual([await interest(), await interest()], ['gemini', 'keywords']);
  assert.equal(gemini.calls.length, 3, 'exhausted shares do not spend the overall ceiling');
  const first = await photo();
  assert.equal(first.status, 200);
  assert.equal(first.json.matched, true);
  const second = await photo();
  assert.equal(second.status, 429);
  assert.equal(second.json.error.code, 'GEMINI_DAILY_LIMIT');
  assert.equal(gemini.calls.length, 4);
});

test('daily ceilings reset at midnight in Japan, not at 09:00 JST', async () => {
  assert.equal(japanDay(Date.parse('2026-11-13T14:59:59Z')), '2026-11-13');
  assert.equal(japanDay(Date.parse('2026-11-13T15:00:00Z')), '2026-11-14');
  let clock = Date.parse('2026-11-13T23:59:00+09:00');
  const gemini = fakeGemini(() => ({ texts: ['池田屋'], scene: '石碑' }));
  const handler = createHandler({ catalog, env: { PAID_API_UNTIL: OPEN, MAX_GEMINI_CALLS_PER_DAY: '1' }, gemini, now: () => clock });
  const photo = async () => (await invoke(handler, { path: '/v1/recognize', body: { spotId: 'ikedaya', image: 'A'.repeat(400) } })).status;
  assert.equal(await photo(), 200);
  assert.equal(await photo(), 429);
  clock = Date.parse('2026-11-14T00:00:00+09:00');
  assert.equal(await photo(), 200, 'a new day in Japan');
  clock = Date.parse('2026-11-14T08:59:00+09:00');
  assert.equal(await photo(), 429, 'still the same day in Japan before 09:00');
});

test('the statue spot unlocks from its stone marker text and stays hidden in teasers', async () => {
  const image = 'A'.repeat(400);
  // The marker is carved vertically; Gemini may split it into short lines.
  const marker = fakeGemini(() => ({ texts: ['高山彦九', '郎先生', '皇居望拝', '之趾'], scene: '石標' }));
  const hit = await recognizeSpot({ spotId: 'takayama-hikokuro', image }, { catalog, gemini: marker });
  assert.equal(hit.matched, true);
  assert.ok(!`${marker.calls[0].system}${marker.calls[0].prompt}`.includes('彦九郎'), 'the expected spot is not revealed to Gemini');
  // The same photo must not unlock the bridge or the ekiden stone next to it.
  for (const spotId of ['sanjo-giboshi', 'ekiden-monument']) {
    assert.equal((await recognizeSpot({ spotId, image }, { catalog, gemini: fakeGemini(() => ({ texts: ['高山彦九郎先生皇居望拝之趾'], scene: '石標' })) })).matched, false, spotId);
  }

  const input = { fromSpotId: 'ekiden-monument', toSpotId: 'takayama-hikokuro', topicIds: ['people'] };
  const fixed = catalog.spots.find((spot) => spot.id === 'ekiden-monument').relatedNotes['takayama-hikokuro'];
  const words = catalog.spots.find((spot) => spot.id === 'takayama-hikokuro').spoilerWords;
  assert.ok(!words.some((word) => fixed.includes(word)), 'the fixed note does not name the statue');
  const spoiled = await createTeaser(input, { catalog, gemini: fakeGemini(() => ({ text: 'すぐそばに、高山彦九郎の像があります。', usedFactIds: ['takayama-hikokuro:f3'] })) });
  assert.deepEqual(spoiled, { text: fixed, usedFactIds: [], source: 'fixed' });
  const wrongYear = await createTeaser(input, { catalog, gemini: fakeGemini(() => ({ text: 'すぐそばに、1945年に一度姿を消した像があります。', usedFactIds: ['takayama-hikokuro:f4'] })) });
  assert.equal(wrongYear.source, 'fixed');
  const good = await createTeaser(input, { catalog, gemini: fakeGemini(() => ({ text: 'すぐそばに、1944年に一度姿を消し、1961年に戻ってきた像があります。', usedFactIds: ['takayama-hikokuro:f4'] })) });
  assert.equal(good.source, 'gemini');
});
