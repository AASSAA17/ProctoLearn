// Isolated browser regression: start Next on port 3107, then run this file.
// E2E_WEB_URL and E2E_CHROME_PATH may override the local server/browser.
// All API requests are mocked; no backend, database, or real capture devices are used.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const web = process.env.E2E_WEB_URL || 'http://localhost:3107';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(web).hostname), 'Use a local Next server');

function captureDevices() {
  window.captureEvidence = { streams: [], recorders: [] };
  const stream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const draw = canvas.getContext('2d');
    let frame = 0;
    setInterval(() => {
      draw.fillStyle = frame++ % 2 ? 'red' : 'blue';
      draw.fillRect(0, 0, 160, 120);
    }, 50);
    const captured = canvas.captureStream(20);
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const destination = audio.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start();
    void audio.resume();
    captured.addTrack(destination.stream.getAudioTracks()[0]);
    for (const track of captured.getTracks()) {
      const stop = track.stop.bind(track);
      track.stopCalls = 0;
      track.stop = () => { track.stopCalls++; stop(); };
    }
    window.captureEvidence.streams.push(captured);
    return captured;
  };
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => stream() });
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => stream() });
  const NativeRecorder = MediaRecorder;
  window.MediaRecorder = class extends NativeRecorder {
    constructor(...args) {
      super(...args);
      this.stopCalls = 0; this.bytes = []; this.stopped = false;
      this.addEventListener('dataavailable', ({ data }) => { if (data.size) this.bytes.push(data.size); });
      this.addEventListener('stop', () => { this.stopped = true; });
      window.captureEvidence.recorders.push(this);
    }
    stop() { this.stopCalls++; return super.stop(); }
  };
}

async function localRecordings(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('proctolearn-recordings-v1', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction(['sessions', 'chunks']);
      const sessions = transaction.objectStore('sessions').getAll();
      const chunks = transaction.objectStore('chunks').getAll();
      transaction.oncomplete = () => {
        resolve({ sessions: sessions.result, chunks: chunks.result.map(chunk => ({ ...chunk, blob: undefined, blobSize: chunk.blob.size })) });
        db.close();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function scenario(browser, mode) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.addInitScript(captureDevices);
  const submissions = [];
  const held = [];
  let retry = false;
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (pathname === '/auth/me') return json({ id: 'expiry-student', role: 'STUDENT', name: 'Expiry student', email: 'expiry@example.test' });
    if (pathname === '/auth/csrf') return json({ csrfToken: 'expiry-csrf' });
    if (pathname === '/attempts/preflight/expiry-exam') return json({ duration: 1, remainingSeconds: 4, recordingUsedBytes: 0 });
    if (pathname === '/attempts/start/expiry-exam') {
      const now = Date.now();
      return json({ id: 'expiry-attempt', trustScore: 100, startedAt: new Date(now).toISOString(), serverTime: new Date(now).toISOString(), expiresAt: new Date(now + 4000).toISOString(), draft: { answers: [], revision: 0, updatedAt: null }, exam: { id: 'expiry-exam', title: 'Expiry regression', duration: 1, passScore: 60, questions: [{ id: 'answer', text: 'Your answer', type: 'TEXT', options: null }] } });
    }
    if (pathname === '/attempts/expiry-attempt/draft') return json({ ...request.postDataJSON(), revision: 1, updatedAt: new Date().toISOString() });
    if (pathname === '/attempts/expiry-attempt/submit') {
      submissions.push(request.postDataJSON());
      if (retry) return json({ passed: true, score: 100 });
      if (mode === 'offline') return route.abort('internetdisconnected');
      if (mode === '503') return json({ message: 'Unavailable' }, 503);
      held.push(route); // Real Axios timeout, or explicitly held until after expiry checks.
      return;
    }
    if (pathname.startsWith('/evidence/')) return route.abort('internetdisconnected');
    if (url.origin === new URL(web).origin) return route.continue();
    return route.abort();
  });
  try {
    await page.goto(`${web}/dashboard/exam/expiry-exam`, { timeout: 60000 });
    await page.getByRole('button', { name: 'Камера мен экранды қосып, бастау / жалғастыру' }).click();
    const answer = page.getByRole('textbox', { name: 'Жауап', exact: true });
    await answer.fill('Frozen answer before expiry');
    await page.waitForFunction(() => window.captureEvidence.recorders.length === 2 && window.captureEvidence.recorders.every(recorder => recorder.state === 'recording'));
    if (mode === 'manual-in-flight') await page.getByRole('button', { name: 'Жауаптарды жіберу', exact: true }).click();
    await page.getByText('00:00', { exact: true }).waitFor();
    // Privacy boundary: do not wait for a failed, hung, or timed-out submission.
    await page.waitForFunction(() => window.captureEvidence.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')), null, { timeout: 1000 });
    await page.waitForFunction(() => window.captureEvidence.recorders.every(recorder => recorder.stopped), null, { timeout: 1000 });
    assert.equal(await answer.isDisabled(), true, `${mode}: expired answers are frozen`);
    if (mode === 'manual-in-flight' || mode === 'hung') {
      assert.equal(submissions.length, 1, `${mode}: expiry must not duplicate an in-flight submit`);
      await Promise.all(held.splice(0).map(route => route.abort('failed')));
    }
    // The timeout case deliberately waits for the application's real 20-second timeout.
    const retryButton = page.getByRole('button', { name: 'Сол жауаптарды қайта жіберу', exact: true });
    await retryButton.waitFor({ timeout: 25000 });
    assert.equal(submissions.length, 1, `${mode}: one initial submit`);
    const capture = await page.evaluate(() => ({
      recorders: window.captureEvidence.recorders.map(recorder => ({ stopCalls: recorder.stopCalls, bytes: recorder.bytes })),
      tracks: window.captureEvidence.streams.flatMap(stream => stream.getTracks().map(track => ({ kind: track.kind, stops: track.stopCalls }))),
    }));
    assert.deepEqual(capture.tracks.map(track => track.kind).sort(), ['audio', 'audio', 'video', 'video']);
    assert.ok(capture.tracks.every(track => track.stops === 1), `${mode}: every camera/screen/audio track stopped once`);
    assert.ok(capture.recorders.every(recorder => recorder.stopCalls === 1 && recorder.bytes.length > 0), `${mode}: each real recorder stopped exactly once with nonempty data`);
    // Wait on persisted state, not a sleep: flushLocal must include final dataavailable.
    await page.waitForFunction(() => new Promise(resolve => {
      const request = indexedDB.open('proctolearn-recordings-v1', 1);
      request.onsuccess = () => {
        const db = request.result;
        const sessions = db.transaction('sessions').objectStore('sessions').getAll();
        sessions.onsuccess = () => { resolve(sessions.result.length === 2 && sessions.result.every(session => session.state === 'pending')); db.close(); };
      };
    }));
    const saved = await localRecordings(page);
    for (const [index, kind] of ['camera', 'screen'].entries()) {
      const session = saved.sessions.find(item => item.kind === kind);
      const chunks = saved.chunks.filter(chunk => chunk.sessionId === session.id);
      assert.deepEqual(chunks.map(chunk => chunk.blobSize), capture.recorders[index].bytes, `${mode}: ${kind} retains every chunk including final dataavailable`);
      assert.ok(chunks.every(chunk => chunk.sent === 0), `${mode}: offline upload retains unsent chunks`);
      assert.equal(session.totalBytes, chunks.reduce((sum, chunk) => sum + chunk.blobSize, 0));
    }
    retry = true;
    await retryButton.click();
    await page.getByRole('heading', { name: 'Жауаптар қабылданды' }).waitFor();
    assert.deepEqual(submissions, [{ answers: [{ questionId: 'answer', answer: 'Frozen answer before expiry' }] }, { answers: [{ questionId: 'answer', answer: 'Frozen answer before expiry' }] }], `${mode}: retry preserves exact frozen answers`);
    const retried = await localRecordings(page);
    assert.deepEqual(retried.chunks, saved.chunks, `${mode}: failed upload retry must not discard or duplicate local chunks`);
    assert.deepEqual(retried.sessions.map(({ updatedAt, ...session }) => session), saved.sessions.map(({ updatedAt, ...session }) => session), `${mode}: retry preserves recording metadata except its update timestamp`);
    assert.deepEqual(await page.evaluate(() => window.captureEvidence.recorders.map(recorder => recorder.stopCalls)), [1, 1], `${mode}: retry never stops recorders twice`);
    console.log(`PASS ${mode}: expiry stops capture independently, retains final chunks, retries frozen answers`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const mode of ['offline', '503', 'hung', 'timeout', 'manual-in-flight']) await scenario(browser, mode);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
