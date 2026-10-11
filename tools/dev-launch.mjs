// Dependency-free visual preview. It uses the real API handlers and defaults
// to unavailable signup/payment config. It never synthesizes signup success.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { Readable } from 'node:stream';
import { onRequest as configHandler } from '../functions/api/launch/config.js';
import { onRequest as subscribeHandler } from '../functions/api/launch/subscribe.js';

const root = resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
const port = Number(process.env.LAUNCH_PREVIEW_PORT || 8788);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };

async function staticFile(pathname) {
  const segments = pathname.split('/');
  if (segments.some(segment => segment.startsWith('.')) || ['functions', 'node_modules'].includes(segments[1])) return null;
  let path = resolve(root, `.${pathname}`);
  if (path !== root && !path.startsWith(root + sep)) return null;
  try {
    const info = await stat(path);
    if (info.isDirectory()) path = resolve(path, 'index.html');
    return { body: await readFile(path), type: types[extname(path)] || 'application/octet-stream' };
  } catch {
    if (!extname(path)) {
      try { return { body: await readFile(path + '.html'), type: types['.html'] }; } catch { /* 404 */ }
    }
    return null;
  }
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://127.0.0.1:${port}`);
    const route = url.pathname;
    if (route === '/api/launch/config' || route === '/api/launch/subscribe') {
      const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming);
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(body ? { body, duplex: 'half' } : {}) });
      const response = await (route.endsWith('/config') ? configHandler : subscribeHandler)({ request, env: process.env });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(incoming.method)) { outgoing.writeHead(405, { Allow: 'GET, HEAD' }); outgoing.end(); return; }
    const file = await staticFile(decodeURIComponent(route));
    if (!file) { outgoing.writeHead(404, { 'Content-Type': 'text/plain' }); outgoing.end('Not found'); return; }
    outgoing.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    outgoing.end(incoming.method === 'HEAD' ? undefined : file.body);
  } catch {
    outgoing.writeHead(500, { 'Content-Type': 'text/plain' });
    outgoing.end('Preview request could not be completed');
  }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`Launch preview: http://127.0.0.1:${port}/launch\n`));
function stop() { server.close(() => process.exit(0)); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
