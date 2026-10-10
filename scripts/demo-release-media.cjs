'use strict';
// Reproducible original silent educational diagram. No downloaded footage or licensed soundtrack.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const frontendRequire = createRequire(path.join(__dirname, '../frontend/package.json'));

async function generate() {
  const directory = path.join(__dirname, '../frontend/public/demo');
  const output = path.join(directory, 'html-structure.webm');
  if (fs.existsSync(output)) { console.log('Original demo clip already exists; preserved.'); return; }
  const { chromium } = frontendRequire('playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(12);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 500000 });
      const chunks = [];
      const finished = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.start();
      const drawBox = (x, y, width, title, caption, active) => {
        context.fillStyle = active ? '#5a46dd' : '#202d49'; context.fillRect(x, y, width, 82);
        context.fillStyle = '#ffffff'; context.font = 'bold 27px Arial'; context.fillText(title, x + 20, y + 33);
        context.fillStyle = '#e1e5f0'; context.font = '18px Arial'; context.fillText(caption, x + 20, y + 63);
      };
      for (let frame = 0; frame < 144; frame++) {
        const phase = Math.floor(frame / 36);
        context.fillStyle = '#0c1426'; context.fillRect(0, 0, 960, 540);
        context.fillStyle = '#b9a9ff'; context.font = '18px Arial'; context.fillText('PROCTOLEARN / ORIGINAL SILENT DEMO CLIP', 48, 44);
        context.fillStyle = '#ffffff'; context.font = 'bold 35px Arial'; context.fillText('HTML: structure and meaning', 48, 96);
        drawBox(310, 125, 340, '<html lang="kk">', 'The document root', phase === 0);
        drawBox(60, 248, 370, '<head>', 'Metadata: title, charset', phase === 1);
        drawBox(530, 248, 370, '<body>', 'Visible page content', phase === 2);
        drawBox(530, 362, 370, '<h1> and <p>', 'A heading and a paragraph', phase === 3);
        context.fillStyle = '#cbd5e1'; context.font = '18px Arial';
        context.fillText('Demonstration only. Read the lesson transcript for the full explanation.', 48, 499);
        context.fillStyle = '#22d3ee'; context.fillRect(0, 534, 960 * (frame + 1) / 144, 6);
        await new Promise(resolve => setTimeout(resolve, 1000 / 12));
      }
      recorder.stop(); await finished; stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
    });
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(output, Buffer.from(bytes), { flag: 'wx' });
    console.log(`Original demo clip generated (${bytes.length} bytes).`);
  } finally { await browser.close(); }
}
if (require.main === module) generate().catch(error => { console.error(error.message); process.exitCode = 1; });
