import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { computeRoutes, loadCatalog, RouteError } from './routes.mjs';
import { createGemini } from './gemini.mjs';
import { createTeaser, interpretInterest, MAX_IMAGE_BASE64, recognizeSpot } from './ai.mjs';
import { createStaticHandler } from './static.mjs';
import { dailyLimit, PAID_API_MAX_PER_DAY, paidApiDeadline, paidApiOpen } from './paid.mjs';

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

// "A day" for the call ceilings is a calendar day in Japan (UTC+9, no DST),
// so counts reset at midnight JST rather than at 09:00 JST.
export function japanDay(ms) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Per-feature share of the Gemini ceiling. Default 15, never above the overall 50. */
export const FEATURE_GEMINI_DEFAULT = 15;
function featureLimit(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, PAID_API_MAX_PER_DAY) : FEATURE_GEMINI_DEFAULT;
}

function dailyCounter(now, max, code, message) {
  let day = japanDay(now());
  let count = 0;
  return () => {
    const today = japanDay(now());
    if (today !== day) { day = today; count = 0; }
    if (count >= max) throw new RouteError(429, code, message);
    count += 1;
  };
}

function minuteWindow(now, max) {
  let start = now();
  let count = 0;
  return () => {
    if (now() - start >= 60_000) { start = now(); count = 0; }
    if (count >= max) return false;
    count += 1;
    return true;
  };
}

async function readJson(request, maxBytes = 4096) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RouteError(415, 'JSON_REQUIRED', 'JSON形式で送信してください。');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new RouteError(413, 'BODY_TOO_LARGE', 'リクエストが大きすぎます。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RouteError(400, 'INVALID_JSON', 'JSON形式を確認してください。'); }
}

function sameOrigin(origin, host) {
  try { return Boolean(host) && new URL(origin).host === host; } catch { return false; }
}

export function createHandler({ catalog, env = process.env, fetchImpl = fetch, now = Date.now, gemini = createGemini({ env, fetchImpl, now }), serveStatic = null }) {
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081').split(',').map((value) => value.trim()).filter(Boolean));
  // Paid APIs stop at PAID_API_UNTIL (missing or invalid: never open) and at
  // 50 calls a day each. Both are in-memory guards; see server/paid.mjs.
  const paidOpen = () => paidApiOpen(env, now);
  const closed = () => new RouteError(503, 'PAID_API_CLOSED', 'Googleの有料APIは利用期間外です。デモモードをご利用ください。');
  const googleCounter = dailyCounter(now, dailyLimit(env.MAX_GOOGLE_CALLS_PER_DAY), 'DAILY_LIMIT', '本日の経路計算の上限に達しました。');
  const geminiCounter = dailyCounter(now, dailyLimit(env.MAX_GEMINI_CALLS_PER_DAY), 'GEMINI_DAILY_LIMIT', '本日のAI利用の上限に達しました。');
  const beforeGoogleCall = () => { if (!paidOpen()) throw closed(); googleCounter(); };
  const beforeGeminiCall = () => { if (!paidOpen()) throw closed(); geminiCounter(); };
  const routeMinute = minuteWindow(now, positiveInteger(env.MAX_REQUESTS_PER_MINUTE, 10, 120));
  const aiMinute = minuteWindow(now, positiveInteger(env.MAX_AI_REQUESTS_PER_MINUTE, 30, 300));
  // Count every Gemini call against the daily ceiling. A refused call makes the
  // AI helpers fall back to fixed text instead of failing the request.
  // After the window closes, `enabled` turns false so callers skip Gemini.
  // The teaser runs on its own whenever a discovered spot is opened, so it and
  // the interest reader each get a smaller share (15 by default). The photo
  // reader, the live demo's key step, has no share and keeps at least 20 calls.
  const counted = (beforeFeatureCall = () => {}) => (gemini?.enabled
    ? { ...gemini, get enabled() { return paidOpen(); }, generateJson: async (args) => { beforeFeatureCall(); beforeGeminiCall(); return gemini.generateJson(args); } }
    : gemini);
  const countedGemini = counted();
  const teaserGemini = counted(dailyCounter(now, featureLimit(env.MAX_TEASER_CALLS_PER_DAY), 'TEASER_DAILY_LIMIT', '本日の一言の上限に達しました。'));
  const interestGemini = counted(dailyCounter(now, featureLimit(env.MAX_INTEREST_CALLS_PER_DAY), 'INTEREST_DAILY_LIMIT', '本日の分類の上限に達しました。'));
  const routesKey = () => (paidOpen() ? env.GOOGLE_ROUTES_API_KEY : undefined);
  const inFlight = { routes: 0, ai: 0 };
  const endpoints = {
    '/v1/routes': { pool: 'routes', maxInFlight: 2, minute: routeMinute, run: (input) => {
      if (env.GOOGLE_ROUTES_API_KEY && !paidOpen()) throw closed();
      return computeRoutes(input, { catalog, apiKey: env.GOOGLE_ROUTES_API_KEY, fetchImpl, beforeGoogleCall });
    } },
    '/v1/interests': { pool: 'ai', maxInFlight: 4, minute: aiMinute, run: (input) => interpretInterest(input, { catalog, gemini: interestGemini }) },
    '/v1/teaser': { pool: 'ai', maxInFlight: 4, minute: aiMinute, run: (input) => createTeaser(input, { catalog, gemini: teaserGemini }) },
    // Photos are the only large bodies; they go to Gemini and are never written anywhere.
    '/v1/recognize': { pool: 'ai', maxInFlight: 4, minute: aiMinute, maxBytes: MAX_IMAGE_BASE64 + 1024, run: (input) => recognizeSpot(input, { catalog, gemini: countedGemini }) },
  };

  return async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {
      if (response.writableEnded) return;
      response.setHeader('Cache-Control', 'no-store');
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    const path = (request.url ?? '/').split('?')[0];
    const isApi = path === '/health' || path.startsWith('/v1/');
    if (!isApi && serveStatic && (request.method === 'GET' || request.method === 'HEAD')) {
      await serveStatic(request, response, path);
      return;
    }
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin) && !sameOrigin(origin, request.headers.host)) {
      request.resume();
      send(403, { error: { code: 'ORIGIN_DENIED', message: 'このWebプレビューからの接続は許可されていません。' } });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      response.end();
      return;
    }
    if (path === '/health' && request.method === 'GET') {
      const deadline = paidApiDeadline(env);
      send(200, {
        ok: true, routesConfigured: Boolean(routesKey()), geminiConfigured: Boolean(countedGemini?.enabled),
        paidApiUntil: deadline === null ? null : new Date(deadline).toISOString(),
      });
      return;
    }
    // Browser key for the Maps JavaScript API. It is public by design and must be
    // restricted to this site's URL (HTTP referrer) and to the Maps JavaScript API.
    // Map loads are billed in the browser and not counted here; after the paid
    // window the key is withheld and the web app draws the sketch map.
    if (path === '/v1/config' && request.method === 'GET') {
      send(200, { mapsApiKey: (paidOpen() && env.GOOGLE_MAPS_BROWSER_KEY) || null });
      return;
    }
    const endpoint = endpoints[path];
    if (!endpoint || request.method !== 'POST') {
      request.resume();
      send(404, { error: { code: 'NOT_FOUND', message: '指定されたAPIはありません。' } });
      return;
    }
    if (inFlight[endpoint.pool] >= endpoint.maxInFlight || !endpoint.minute()) {
      request.resume();
      response.setHeader('Retry-After', '60');
      send(429, { error: { code: 'RATE_LIMIT', message: 'しばらく待ってから再度お試しください。' } });
      return;
    }
    inFlight[endpoint.pool] += 1;
    try {
      send(200, await endpoint.run(await readJson(request, endpoint.maxBytes)));
    } catch (error) {
      // Do not log keys, precise user location, Google payloads, or raw errors.
      send(error instanceof RouteError ? error.status : 500, {
        error: { code: error instanceof RouteError ? error.code : 'INTERNAL_ERROR', message: error instanceof RouteError ? error.message : '処理できませんでした。' },
      });
    } finally {
      inFlight[endpoint.pool] -= 1;
    }
  };
}

export async function startServer() {
  const catalog = await loadCatalog();
  const port = positiveInteger(process.env.PORT, 8787, 65535);
  const host = process.env.HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1');
  const serveStatic = await createStaticHandler(process.env.WEB_DIST_DIR);
  const handler = createHandler({ catalog, serveStatic });
  const server = http.createServer(handler);
  server.requestTimeout = 30_000; // photo upload + Gemini reading
  server.headersTimeout = 10_000;
  server.listen(port, host, () => console.log(`MICHI server: http://${host}:${port}${serveStatic ? ' (web + api)' : ' (api only)'}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}
