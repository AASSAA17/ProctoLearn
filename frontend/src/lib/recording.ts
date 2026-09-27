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
