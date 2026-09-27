/** MediaRecorder fires its final dataavailable event BEFORE stop. */
export function stopRecorder(recorder: MediaRecorder | null): Promise<void> {
  if (!recorder || recorder.state === 'inactive') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      recorder.removeEventListener('stop', onStop);
      recorder.removeEventListener('error', onError);
    };
    const onStop = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Recording failed')); };
    recorder.addEventListener('stop', onStop, { once: true });
    recorder.addEventListener('error', onError, { once: true });
    try { recorder.stop(); } catch (error) { cleanup(); reject(error); }
  });
}

/** Register before start: an automatically stopped recorder may be inactive before its final chunk arrives. */
export function observeRecorderStop(recorder: MediaRecorder, timeoutMs = 10000): () => Promise<void> {
  let finished = false;
  let resolveStopped: () => void;
  const stopped = new Promise<void>((resolve) => { resolveStopped = resolve; });
  recorder.addEventListener('stop', () => { finished = true; resolveStopped(); }, { once: true });
  let waiting: Promise<void> | null = null;
  return () => {
    if (finished) return Promise.resolve();
    if (waiting) return waiting;
    waiting = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Recording did not finish in time')), timeoutMs);
      stopped.then(() => { clearTimeout(timeout); resolve(); });
      try { if (recorder.state !== 'inactive') recorder.stop(); }
      catch (error) { clearTimeout(timeout); reject(error); }
    });
    return waiting;
  };
}
