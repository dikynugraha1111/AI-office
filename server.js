#!/usr/bin/env node
// Agent Office server: receives Claude Code hook events, keeps agent state,
// streams it to the browser over Server-Sent Events. Zero dependencies.
//
//   node server.js            start on http://127.0.0.1:4777
//   node server.js --demo     start and play a fake multi-agent session
//   node server.js --open     also open the browser
//   PORT=5000 node server.js  different port

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');
const { Office } = require('./lib/office');
const { runDemo } = require('./lib/demo');

const PORT = Number(process.env.PORT || process.env.AGENT_OFFICE_PORT || 4777);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const LOG_FILE = process.env.AGENT_OFFICE_LOG || path.join(__dirname, 'data', 'events.jsonl');
const args = new Set(process.argv.slice(2));

const clients = new Set();
let broadcastTimer = null;
const office = new Office({
  onChange() {
    // coalesce bursts of hook events into one push
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      const data = `event: snapshot\ndata: ${JSON.stringify(office.snapshot())}\n\n`;
      for (const res of clients) res.write(data);
    }, 80);
  },
});

let demo = null;
function startDemo() {
  demo?.stop();
  demo = runDemo(office);
  return demo.duration;
}

// raw events are appended to a log so you can see exactly what the hooks send
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
function logEvent(p) {
  const slim = { ...p };
  if (slim.tool_input) slim.tool_input = JSON.stringify(slim.tool_input).slice(0, 400);
  if (slim.tool_response) slim.tool_response = '[omitted]';
  fs.appendFile(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...slim }) + '\n', () => {});
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'POST' && url.pathname === '/event') {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return json(res, 400, { error: 'invalid json' });
      }
      logEvent(payload);
      office.handle(payload);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify(office.snapshot())}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    if (url.pathname === '/api/state') return json(res, 200, office.snapshot());
    if (req.method === 'POST' && url.pathname === '/api/demo') return json(res, 200, { ok: true, duration: startDemo() });
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      demo?.stop();
      office.reset();
      return json(res, 200, { ok: true });
    }

    // static files
    const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
    fs.readFile(file, (err, buf) => {
      if (err) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(buf);
    });
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} sudah dipakai. Mungkin Agent Office sudah jalan? Coba buka http://${HOST}:${PORT}`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const link = `http://${HOST}:${PORT}`;
  console.log(`\n  🏢  Diky Office jalan di ${link}`);
  console.log(`  📨  Hook endpoint: POST ${link}/event`);
  console.log(`  📝  Log event mentah: ${LOG_FILE}\n`);
  if (args.has('--demo')) {
    startDemo();
    console.log('  🎬  Mode demo aktif\n');
  }
  if (args.has('--open')) exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'} ${link}`);
});
