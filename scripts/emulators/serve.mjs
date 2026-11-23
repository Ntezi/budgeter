#!/usr/bin/env node
// Serves dist-emulator/ on 127.0.0.1 with an SPA fallback (QA target, design "QA target decision").
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './env.mjs';

const dir = path.join(root, 'dist-emulator');
const port = Number(process.env.PORT || 8090);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  let file = path.join(dir, urlPath);
  if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const html = `${file}.html`;
    file = fs.existsSync(html) ? html : path.join(dir, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`[serve] dist-emulator on http://127.0.0.1:${port}`));
