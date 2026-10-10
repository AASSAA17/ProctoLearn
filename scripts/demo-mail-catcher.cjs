#!/usr/bin/env node
'use strict';
// Loopback-only development mail sink. Never forwards mail; private messages stay in the ignored profile.
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../.local');
const arg = process.argv.indexOf('--dir');
const dir = path.resolve(arg >= 0 ? process.argv[arg + 1] : path.join(root, 'release-demo/mail'));
if (!dir.startsWith(root + path.sep)) throw new Error('Mail directory must be inside ignored .local');
fs.mkdirSync(dir, { recursive: true });
const smtp = net.createServer((socket) => {
  let buffer = '', data = false, message = '', sender = '', recipient = '';
  socket.setTimeout(30000, () => socket.destroy());
  socket.write('220 localhost ProctoLearn demo mail sink\r\n');
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    if (Buffer.byteLength(buffer) + Buffer.byteLength(message) > 1024 * 1024) { socket.end('552 Message too large\r\n'); return; }
    let end;
    while ((end = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (data) {
        if (line === '.') {
          const id = randomUUID();
          fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, at: new Date().toISOString(), sender, recipient, raw: message }), { mode: 0o600 });
          message = ''; data = false; socket.write('250 Captured locally\r\n');
        } else message += line.replace(/^\.\./, '.') + '\r\n';
      } else if (/^(EHLO|HELO) /i.test(line)) socket.write('250-localhost\r\n250 SIZE 1048576\r\n');
      else if (/^MAIL FROM:/i.test(line)) { sender = line.slice(10); socket.write('250 OK\r\n'); }
      else if (/^RCPT TO:/i.test(line)) { recipient = line.slice(8); socket.write('250 OK\r\n'); }
      else if (/^DATA$/i.test(line)) { data = true; socket.write('354 End with dot\r\n'); }
      else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
      else if (/^(RSET|NOOP)$/i.test(line)) { message = ''; socket.write('250 OK\r\n'); }
      else socket.write('502 Unsupported\r\n');
    }
  });
});
const escape = (value) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function resetLink(raw) {
  const split = raw.indexOf('\r\n\r\n');
  const headers = raw.slice(0, split), body = raw.slice(split + 4);
  const decoded = /Content-Transfer-Encoding: base64/i.test(headers) ? Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
    : body.replace(/=\r\n/g, '').replace(/=([A-F0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const match = decoded.match(/https?:\/\/[^\s"<>]+\/auth\/reset-password\?token=[a-zA-Z0-9_-]+/);
  if (!match) return '';
  const url = new URL(match[0]);
  return ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '3000' ? url.href : '';
}
const web = http.createServer((req, res) => {
  // Reject DNS rebinding / remote-host browser requests and never enable CORS.
  if (!['127.0.0.1:8025', 'localhost:8025'].includes(req.headers.host) || req.method !== 'GET') { res.writeHead(403); res.end(); return; }
  const messages = fs.readdirSync(dir).filter((name) => /^[a-f0-9-]+\.json$/.test(name)).slice(-100)
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))).sort((a, b) => b.at.localeCompare(a.at));
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (req.url === '/api/messages') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(messages)); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProctoLearn demo mailbox</title><h1>Локальная демо-почта</h1><p>Письма не отправляются в интернет. Содержимое приватное.</p>' + messages.map((m) => `<article><h2>${escape(m.at)}</h2>${resetLink(m.raw) ? `<p><a href="${escape(resetLink(m.raw))}" rel="noreferrer">Открыть локальную ссылку восстановления</a></p>` : ''}<pre>${escape(m.raw)}</pre></article>`).join('') + '</html>');
});
smtp.listen(1025, '127.0.0.1'); web.listen(8025, '127.0.0.1');
for (const server of [smtp, web]) server.on('error', () => { console.error('Local mail catcher could not bind'); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { smtp.close(); web.close(); setTimeout(() => process.exit(0), 100).unref(); });
