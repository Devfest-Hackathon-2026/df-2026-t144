import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { computeRoutes, loadCatalog, RouteError } from './routes.mjs';
import { createGemini } from './gemini.mjs';
import { createTeaser, interpretInterest } from './ai.mjs';
import { createStaticHandler } from './static.mjs';

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

function dailyCounter(now, max, code, message) {
  let day = new Date(now()).toISOString().slice(0, 10);
  let count = 0;
  return () => {
    const today = new Date(now()).toISOString().slice(0, 10);
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

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RouteError(415, 'JSON_REQUIRED', 'JSON形式で送信してください。');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new RouteError(413, 'BODY_TOO_LARGE', 'リクエストが大きすぎます。');
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
  const beforeGoogleCall = dailyCounter(now, positiveInteger(env.MAX_GOOGLE_CALLS_PER_DAY, 100, 10_000), 'DAILY_LIMIT', '本日の経路計算の上限に達しました。');
  const beforeGeminiCall = dailyCounter(now, positiveInteger(env.MAX_GEMINI_CALLS_PER_DAY, 500, 20_000), 'GEMINI_DAILY_LIMIT', '本日のAI利用の上限に達しました。');
  const routeMinute = minuteWindow(now, positiveInteger(env.MAX_REQUESTS_PER_MINUTE, 10, 120));
  const aiMinute = minuteWindow(now, positiveInteger(env.MAX_AI_REQUESTS_PER_MINUTE, 30, 300));
  // Count every Gemini call against the daily ceiling. A refused call makes the
  // AI helpers fall back to fixed text instead of failing the request.
  const countedGemini = gemini?.enabled
    ? { ...gemini, generateJson: async (args) => { beforeGeminiCall(); return gemini.generateJson(args); } }
    : gemini;
  const inFlight = { routes: 0, ai: 0 };
  const endpoints = {
    '/v1/routes': { pool: 'routes', maxInFlight: 2, minute: routeMinute, run: (input) => computeRoutes(input, { catalog, apiKey: env.GOOGLE_ROUTES_API_KEY, fetchImpl, beforeGoogleCall }) },
    '/v1/interests': { pool: 'ai', maxInFlight: 4, minute: aiMinute, run: (input) => interpretInterest(input, { catalog, gemini: countedGemini }) },
    '/v1/teaser': { pool: 'ai', maxInFlight: 4, minute: aiMinute, run: (input) => createTeaser(input, { catalog, gemini: countedGemini }) },
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
      send(200, { ok: true, routesConfigured: Boolean(env.GOOGLE_ROUTES_API_KEY), geminiConfigured: Boolean(gemini?.enabled) });
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
      send(200, await endpoint.run(await readJson(request)));
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
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(port, host, () => console.log(`MICHI server: http://${host}:${port}${serveStatic ? ' (web + api)' : ' (api only)'}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}
