// Small local server for the page (no dependencies).   npm start  |  npm run serve
//   node serve.mjs [port] [--open]     (or PORT=...; --open opens it in the browser)
//  - serves the files in this folder (the libraries come from node_modules)
//  - POST /api/pose, /api/layout : the tuning panel saves Rei's posture / the desk layout
// Re-rendering the room in Blender is not part of this repository.
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 8765);
const url = `http://localhost:${port}/`;
const MAX_BODY = 8192;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.vrm': 'model/gltf-binary', '.svg': 'image/svg+xml',
};
const LAYOUT_KEYS = ['kbScale', 'kbSide', 'kbAway', 'kbYaw', 'mouseShift', 'chairFwd', 'chairSide', 'chairYaw'];

// an error that goes back to the page as { ok: false, detail } with this HTTP status
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), TYPES['.json']);

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new HttpError(413, 'body too large');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new HttpError(400, 'invalid JSON'); }
}

// a flat object of finite numbers; `allowed` (if given) limits the keys
function cleanNumbers(data, allowed) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'object expected');
  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    if (!/^[a-zA-Z]{1,24}$/.test(k) || (allowed && !allowed.includes(k))) throw new HttpError(400, `unknown key ${k}`);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `bad value for ${k}`);
    clean[k] = Math.round(v * 10000) / 10000;
  }
  return clean;
}

// POST handler that writes the request's numbers to assets/<file>
const saveTo = (file, allowed) => async (req, res) => {
  const clean = cleanNumbers(await readJson(req), allowed);
  await fs.writeFile(path.join(root, 'assets', file), JSON.stringify(clean, null, 2) + '\n');
  sendJson(res, 200, { ok: true, file: `assets/${file}` });
};

const ROUTES = {
  'POST /api/pose': saveTo('pose.json'),
  'POST /api/layout': saveTo('layout.json', LAYOUT_KEYS),
};

async function serveFile(pathname, res) {
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.join(root, pathname);   // join normalises away any '..'
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return send(res, 403, 'forbidden');
  const st = await fs.stat(file).catch(() => null);
  if (!st?.isFile()) return send(res, 404, 'not found');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}

async function handle(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { return send(res, 400, 'bad url'); }
  const route = ROUTES[`${req.method} ${pathname}`];
  if (route) return route(req, res);
  if (pathname.startsWith('/api/')) return send(res, 404, 'not found');
  return serveFile(pathname, res);
}

// the system's browser (under WSL, the Windows one)
function openBrowser(target) {
  const wsl = process.platform === 'linux' && /microsoft/i.test(os.release());
  const [cmd, ...cmdArgs] = process.platform === 'win32' ? ['cmd', '/c', 'start', '', target]
    : process.platform === 'darwin' ? ['open', target]
      : wsl ? ['explorer.exe', target] : ['xdg-open', target];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => console.log(`open ${target} in a browser`)).unref();
}

if (!existsSync(path.join(root, 'node_modules', 'three'))) {
  console.error('node_modules がありません。先に npm install を実行してください。');
  process.exit(1);
}

http.createServer((req, res) => {
  handle(req, res).catch(err => {
    if (!(err instanceof HttpError)) console.error(err);
    if (!res.headersSent) sendJson(res, err.status || 500, { ok: false, detail: err.message });
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`Night Work / 夜の作業: ${url}`);
  if (args.includes('--open')) openBrowser(url);
});
