// Serves the Expo web export (`expo export --platform web`) from the same
// Cloud Run service as the API, so judges open one HTTPS URL.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function fileAt(file) {
  try { return (await stat(file)).isFile() ? file : null; } catch { return null; }
}

export async function createStaticHandler(dir) {
  if (!dir) return null;
  const root = path.resolve(dir);
  const index = await fileAt(path.join(root, 'index.html'));
  if (!index) return null;
  return async (request, response, urlPath) => {
    let decoded;
    try { decoded = decodeURIComponent(urlPath); } catch { decoded = '/'; }
    const candidate = path.resolve(root, `.${path.posix.normalize(decoded)}`);
    const inside = candidate === root || candidate.startsWith(root + path.sep);
    // Unknown paths get index.html so client-side routes still load.
    const file = (inside && await fileAt(candidate)) || index;
    const hashed = file.includes(`${path.sep}_expo${path.sep}static${path.sep}`);
    response.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    if (request.method === 'HEAD') { response.end(); return; }
    createReadStream(file).pipe(response);
  };
}
