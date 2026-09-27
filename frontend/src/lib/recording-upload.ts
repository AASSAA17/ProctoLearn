import api from './api';
import type { RecordingTransport } from './durable-recording';

export const recordingTransport: RecordingTransport = {
  init: async (session) => (await api.post(`/evidence/${session.attemptId}/uploads`, {
    kind: session.kind, clientSessionId: session.id, mimeType: session.mimeType,
  }, { timeout: 20000 })).data,
  get: async (id) => (await api.get(`/evidence/uploads/${id}`, { timeout: 20000 })).data,
  put: async (id, index, blob) => {
    const form = new FormData();
    form.append('file', blob, `${index}.webm`);
    return (await api.put(`/evidence/uploads/${id}/chunks/${index}`, form, {
      headers: { 'Content-Type': undefined }, timeout: 30000,
    })).data;
  },
  finish: async (id, expectedChunks, interrupted) => (await api.post(`/evidence/uploads/${id}/complete`, {
    expectedChunks, interrupted,
  }, { timeout: 60000 })).data,
};

/** Web Locks keep a recovery tab from finalizing another tab's active recording. */
export async function claimRecording(id: string): Promise<() => void> {
  if (!navigator.locks) throw new Error('Бұл браузер жазбаны қауіпсіз қалпына келтіруді қолдамайды. Жаңартылған жұмыс үстелі браузерін қолданыңыз.');
  let release: () => void = () => {};
  let ready: (value: () => void) => void;
  let fail: (error: Error) => void;
  const claimed = new Promise<() => void>((resolve, reject) => { ready = resolve; fail = reject; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  void navigator.locks.request(`proctolearn-recording:${id}`, { ifAvailable: true }, async (lock) => {
    if (!lock) { fail(new Error('Бұл жазба басқа қойындыда ашық. Сол қойындыны аяқтаңыз немесе жабыңыз.')); return; }
    ready(release);
    await held;
  }).catch((error) => fail(error));
  return claimed;
}
