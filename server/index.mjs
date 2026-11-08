import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { computeRoutes, loadCatalog, RouteError } from './routes.mjs';

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

export function createHandler({ catalog, env = process.env, fetchImpl = fetch, now = Date.now }) {
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081').split(',').map((value) => value.trim()).filter(Boolean));
  const maxCalls = positiveInteger(env.MAX_GOOGLE_CALLS_PER_DAY, 100, 10_000);
  const maxRequests = positiveInteger(env.MAX_REQUESTS_PER_MINUTE, 10, 120);
  let minuteStart = now();
  let requestCount = 0;
  let day = new Date(now()).toISOString().slice(0, 10);
  let googleCalls = 0;
  let inFlight = 0;

  function beforeGoogleCall() {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) { day = today; googleCalls = 0; }
    if (googleCalls >= maxCalls) throw new RouteError(429, 'DAILY_LIMIT', '本日の経路計算の上限に達しました。');
    googleCalls += 1;
  }

  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {
      if (response.writableEnded) return;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
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
    if (request.url === '/health' && request.method === 'GET') {
      send(200, { ok: true, routesConfigured: Boolean(env.GOOGLE_ROUTES_API_KEY) });
      return;
    }
    if (request.url !== '/v1/routes' || request.method !== 'POST') {
      request.resume();
      send(404, { error: { code: 'NOT_FOUND', message: '指定されたAPIはありません。' } });
      return;
    }
    if (now() - minuteStart >= 60_000) { minuteStart = now(); requestCount = 0; }
    if (requestCount >= maxRequests || inFlight >= 2) {
      request.resume();
      response.setHeader('Retry-After', '60');
      send(429, { error: { code: 'RATE_LIMIT', message: 'しばらく待ってから再度お試しください。' } });
      return;
    }
    requestCount += 1;
    inFlight += 1;
    try {
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
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new RouteError(400, 'INVALID_JSON', 'JSON形式を確認してください。'); }
      const result = await computeRoutes(input, { catalog, apiKey: env.GOOGLE_ROUTES_API_KEY, fetchImpl, beforeGoogleCall });
      send(200, result);
    } catch (error) {
      // Do not log keys, precise user location, Google payloads, or raw errors.
      send(error instanceof RouteError ? error.status : 500, {
        error: { code: error instanceof RouteError ? error.code : 'INTERNAL_ERROR', message: error instanceof RouteError ? error.message : '経路を取得できませんでした。' },
      });
    } finally {
      inFlight -= 1;
    }
  };
}

export async function startServer() {
  const catalog = await loadCatalog();
  const port = positiveInteger(process.env.PORT, 8787, 65535);
  const host = process.env.HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1');
  const server = http.createServer(createHandler({ catalog }));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(port, host, () => console.log(`MICHI routes: http://${host}:${port} (local development)`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}
