import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { computeRoutes, decodePolyline, loadCatalog, validateInput, WALK_WARNING } from './routes.mjs';
import { createHandler } from './index.mjs';

const catalog = await loadCatalog();
const input = { origin: catalog.demoOrigin, destinationId: 'city-hall', budgetMinutes: 5 };
const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const google = (seconds, warnings = []) => ({ ok: true, json: async () => ({ routes: [{ duration: `${seconds}s`, polyline: { encodedPolyline: encoded }, warnings }] }) });

test('decodes Google documented polyline example and rejects truncation', () => {
  assert.deepEqual(decodePolyline(encoded), [
    { latitude: 38.5, longitude: -120.2 },
    { latitude: 40.7, longitude: -120.95 },
    { latitude: 43.252, longitude: -126.453 },
  ]);
  for (const invalid of ['', '_', '\u0000', '??']) {
    assert.throws(() => decodePolyline(invalid), { code: 'INVALID_ROUTE' });
  }
});

test('rejects global origins, unknown destinations, non-numeric coordinates and unbounded budget', () => {
  for (const invalid of [
    null,
    { ...input, origin: { latitude: 0, longitude: 0 } },
    { ...input, origin: { latitude: '35.0093', longitude: 135.77 } },
    { ...input, origin: { latitude: NaN, longitude: 135.77 } },
    { ...input, destinationId: 'anywhere' },
    { ...input, budgetMinutes: 100 },
    { ...input, budgetMinutes: '5' },
  ]) assert.throws(() => validateInput(invalid, catalog));
  assert.equal(validateInput(input, catalog).destination.id, 'city-hall');
});

test('rejects missing key before making any API request', async () => {
  let calls = 0;
  await assert.rejects(computeRoutes(input, { catalog, fetchImpl: async () => { calls += 1; } }), { code: 'NOT_CONFIGURED' });
  assert.equal(calls, 0);
});

test('five-minute budget includes stopover time, keeps boundary and rejects over-budget alternative', async () => {
  const requests = [];
  const durations = [600, 780, 781]; // two stops add 120 seconds: +300 passes, +301 fails
  const result = await computeRoutes(input, {
    catalog, apiKey: 'test-only-not-a-real-key',
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return google(durations.shift(), ['現地の標識を確認']);
    },
  });
  assert.equal(requests.length, 3);
  assert.equal(result.routes.length, 2);
  assert.equal(result.routes[1].extraSeconds, 300);
  assert.equal(result.routes[1].totalSeconds, 900);
  assert.equal(result.routes[1].visitSeconds, 120);
  assert.equal(result.routes[1].source, 'google');
  assert.equal(result.attribution, 'Google Maps');
  assert.ok(result.warnings.includes(WALK_WARNING));
  for (const request of requests) {
    assert.equal(request.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.body.travelMode, 'WALK');
    assert.equal(request.body.computeAlternativeRoutes, false);
    assert.equal(request.body.routingPreference, undefined);
    assert.equal(request.body.optimizeWaypointOrder, undefined);
    assert.ok(request.options.headers['X-Goog-FieldMask'].includes('routes.polyline.encodedPolyline'));
  }
});

test('ten-minute search makes at most four API calls and prioritizes discoveries within budget', async () => {
  let calls = 0;
  const durations = [600, 650, 660, 800];
  const result = await computeRoutes({ ...input, budgetMinutes: 10 }, {
    catalog, apiKey: 'test', fetchImpl: async () => { calls += 1; return google(durations.shift()); },
  });
  assert.equal(calls, 4);
  assert.equal(result.routes[1].spotIds.length, 3);
  assert.equal(result.routes[1].extraSeconds, 380);
  assert.ok(result.routes[1].spotIds.includes('takase-ichino-funairi'));
  assert.ok(!result.routes[1].spotIds.includes('ekiden-monument'));
});

test('returns only direct when every discovery exceeds the limit', async () => {
  let calls = 0;
  const result = await computeRoutes(input, { catalog, apiKey: 'test', fetchImpl: async () => google(calls++ ? 1_200 : 600) });
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].kind, 'direct');
});

test('empty baseline, failed candidate and malformed Google data are real errors', async () => {
  await assert.rejects(computeRoutes(input, { catalog, apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ routes: [] }) }) }), { code: 'NO_ROUTE' });
  let calls = 0;
  await assert.rejects(computeRoutes(input, { catalog, apiKey: 'test', fetchImpl: async () => calls++ === 0 ? google(600) : { ok: false, status: 403 } }), { code: 'GOOGLE_UNAVAILABLE' });
  await assert.rejects(computeRoutes(input, { catalog, apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ routes: [{ duration: 'unknown' }] }) }) }), { code: 'INVALID_ROUTE' });
  await assert.rejects(computeRoutes(input, { catalog, apiKey: 'test', fetchImpl: async () => { throw new Error('Network down'); } }), { code: 'GOOGLE_UNAVAILABLE' });
});

test('a failed candidate does not release the operation while another Google call remains pending', async () => {
  let calls = 0;
  let resolvePending;
  const pending = new Promise((resolve) => { resolvePending = resolve; });
  let completed = false;
  const operation = computeRoutes(input, {
    catalog, apiKey: 'test',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return google(600);
      if (calls === 2) return { ok: false, status: 503 };
      return pending;
    },
  }).then(() => { completed = true; }, (error) => { completed = true; return error; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 3);
  assert.equal(completed, false);
  resolvePending(google(700));
  assert.equal((await operation).code, 'GOOGLE_UNAVAILABLE');
});

async function invoke(handler, { body = input, origin, method = 'POST', path = '/v1/routes', contentType = 'application/json' } = {}) {
  const request = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  request.headers = { 'content-type': contentType, ...(origin ? { origin } : {}) };
  request.method = method;
  request.url = path;
  const response = {
    headers: {}, status: null, body: '', writableEnded: false,
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
    end(body) { this.body = body || ''; this.writableEnded = true; },
  };
  await handler(request, response);
  return { ...response, json: response.body ? JSON.parse(response.body) : null };
}

test('HTTP validates JSON, size, origin and reports missing configuration without exposing internals', async () => {
  const handler = createHandler({ catalog, env: {} });
  assert.equal((await invoke(handler, { origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await invoke(handler, { contentType: 'text/plain' })).status, 415);
  assert.equal((await invoke(handler, { body: '{' })).status, 400);
  assert.equal((await invoke(handler, { body: 'x'.repeat(4097) })).status, 413);
  const result = await invoke(handler);
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, 'NOT_CONFIGURED');
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('HTTP applies process-wide request and Google-call ceilings', async () => {
  const rateHandler = createHandler({ catalog, env: { MAX_REQUESTS_PER_MINUTE: '1' } });
  await invoke(rateHandler);
  assert.equal((await invoke(rateHandler)).status, 429);

  let calls = 0;
  const capped = createHandler({ catalog, env: { GOOGLE_ROUTES_API_KEY: 'test', MAX_GOOGLE_CALLS_PER_DAY: '2' }, fetchImpl: async () => { calls += 1; return google(600); } });
  const result = await invoke(capped);
  assert.equal(result.status, 429);
  assert.equal(result.json.error.code, 'DAILY_LIMIT');
  assert.equal(calls, 2);
});

test('health endpoint does not call Google and reports configured status only', async () => {
  let calls = 0;
  const handler = createHandler({ catalog, env: {}, fetchImpl: async () => { calls += 1; } });
  const result = await invoke(handler, { method: 'GET', path: '/health' });
  assert.deepEqual(result.json, { ok: true, routesConfigured: false, geminiConfigured: false });
  assert.equal(calls, 0);
});
