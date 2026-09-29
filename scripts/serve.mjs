// Minimal static server for dist/ (npm run dev). Mic access works on localhost.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.json': 'application/json', '.wasm': 'application/wasm', '.pck': 'application/octet-stream' };
const PORT = +process.env.PORT || 8080;

http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404, { 'Content-Type': 'text/html' }); fs.createReadStream(path.join(DIST, '404.html')).pipe(res); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
