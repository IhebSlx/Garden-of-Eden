/**
 * Serves the production build for the desktop launcher.
 *
 * Deliberately dependency-free: the launcher used `pnpm exec vite preview`, which
 * meant the app would not start unless pnpm happened to be on PATH — and it is not,
 * in the environment Explorer hands to a double-clicked shortcut. This needs only
 * `node`, which is on the machine PATH.
 *
 *   node scripts/serve.mjs [port]
 *
 * SPA fallback: any path that is not a real file serves index.html, so a deep link
 * does not 404. The port is pinned by the caller because the app's IndexedDB is
 * scoped to the origin, and an origin includes the port.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', 'dist');
const PORT = Number(process.argv[2] ?? 5178);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

/** Resolve a URL path to a file inside dist, or null if it escapes or is missing. */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  // normalize + prefix check keeps `../` out of the served tree.
  const candidate = join(ROOT, normalize(decoded));
  if (!candidate.startsWith(ROOT)) return null;

  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
    if (info.isDirectory()) {
      const index = join(candidate, 'index.html');
      await stat(index);
      return index;
    }
  } catch {
    return null;
  }
  return null;
}

const server = createServer(async (request, response) => {
  const file = (await resolveFile(request.url ?? '/')) ?? join(ROOT, 'index.html');

  try {
    await stat(file);
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('The build is missing. Close this window and start the app again.\n');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    // The app is served fresh from disk every start; never let a stale index stick.
    'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(response);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error('  The app (or "pnpm dev") is probably already running - look for');
    console.error('  another console window, or just open http://localhost:' + PORT + '\n');
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Solarlux Agent Visualiser  ->  http://localhost:${PORT}`);
  console.log('  Close this window to stop it.\n');
});
