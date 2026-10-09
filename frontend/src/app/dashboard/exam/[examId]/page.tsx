'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import api, { WS_URL } from '@/lib/api';
import { observeRecorderStop, stopRecorder } from '@/lib/recording';
import { answerList, answerMap, DraftAnswer, DraftState, ExamDraft, ExamDraftSaver } from '@/lib/exam-draft';
import { finishExpiredConflict, isClosedExamError } from '@/lib/exam-expiry';
import { IndexedDbRecordingStore, LocalRecording } from '@/lib/recording-store';
import { DurableRecording, RecordingQueueState } from '@/lib/durable-recording';
import { claimRecording, recordingTransport } from '@/lib/recording-upload';
import { AUDIO_BITS, CAMERA_BITS, SCREEN_BITS, recordingBudget } from '@/lib/recording-budget';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import styles from './exam.module.css';

interface Question {
  id: string;
  text: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT';
  options: string[] | null;
}
interface Attempt {
  id: string;
  trustScore: number;
  startedAt: string;
  expiresAt: string;
  serverTime: string;
  draft: ExamDraft;
  exam: { id: string; title: string; duration: number; passScore: number; questions: Question[] };
}
interface ExamResult { passed: boolean; score: number; certificatePending?: boolean }
const emptyDraft: DraftState = { status: 'saved', revision: 0, updatedAt: null, dirty: false };

function selectedOptions(value: string | undefined): string[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.filter((option) => typeof option === 'string'); } catch {}
  return value.split(',').filter(Boolean);
}

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const ownerId = useAuthStore((state) => state.user?.id);
  return <ExamSession key={`${ownerId ?? 'anonymous'}:${examId}`} examId={examId} />;
}

function ExamSession({ examId }: { examId: string }) {
  const router = useRouter();
  const ownerId = useAuthStore((state) => state.user?.id);
  const storeRef = useRef(new IndexedDbRecordingStore());
  const writersRef = useRef(new Map<string, DurableRecording>());
  const cameraWriterRef = useRef<DurableRecording | null>(null);
  const screenWriterRef = useRef<DurableRecording | null>(null);
  const releaseExamLockRef = useRef<(() => void) | null>(null);
  const interruptedCaptureRef = useRef(false);
  const [localSessions, setLocalSessions] = useState<LocalRecording[]>([]);
  const [queueStates, setQueueStates] = useState<Record<string, RecordingQueueState>>({});
  const [recovering, setRecovering] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<{ duration: number; remainingSeconds: number; recordingUsedBytes: number } | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const [draftState, setDraftState] = useState<DraftState>(emptyDraft);
  const draftRef = useRef<ExamDraftSaver | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [startError, setStartError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [trustScore, setTrustScore] = useState(100);
  const [currentQ, setCurrentQ] = useState(0);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [submissionFrozen, setSubmissionFrozen] = useState(false);
  const submissionRef = useRef<DraftAnswer[] | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [ended, setEnded] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const mountedRef = useRef(false);
  const endedRef = useRef(false);
  const attemptIdRef = useRef<string | null>(null);
  const deadlineRef = useRef(0);
  const expirySubmittedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraStopRef = useRef<(() => Promise<void>) | null>(null);
  const screenStopRef = useRef<(() => Promise<void>) | null>(null);
  const uploadedRef = useRef(new Set<string>());
  const uploadPromiseRef = useRef<Promise<void> | null>(null);
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {});

  const refreshLocal = useCallback(async () => {
    if (!ownerId) return;
    const sessions = await storeRef.current.list(ownerId, examId);
    if (mountedRef.current) setLocalSessions(sessions.filter((session) => session.state !== 'complete' && !session.supersededBy));
  }, [ownerId, examId]);

  const acquireExamLock = async () => {
    if (!ownerId) throw new Error('Алдымен жүйеге кіріңіз.');
    if (!releaseExamLockRef.current) {
      const release = await claimRecording(`exam:${ownerId}:${examId}`);
      if (!mountedRef.current) { release(); throw new Error('Exam page closed'); }
      releaseExamLockRef.current = release;
    }
  };

  const makeWriter = (session: LocalRecording, recorder?: MediaRecorder) => {
    const writer = new DurableRecording(session.id, storeRef.current, recordingTransport, (state) => {
      if (mountedRef.current) setQueueStates((previous) => ({ ...previous, [session.id]: state }));
      void refreshLocal().catch(() => {});
    }, (paused) => {
      if (paused) {
        interruptedCaptureRef.current = true;
        if (recorder?.state === 'recording') recorder.pause();
        void writer.markInterrupted().catch(() => {});
        if (mountedRef.current) setNotice('Жергілікті сақтау кідірді, жазба уақытша тоқтатылды. Бетті жаппай, сақтауды қайта көріңіз.');
      } else if (recorder?.state === 'paused' && !endedRef.current) recorder.resume();
    });
    writersRef.current.set(session.id, writer);
    return writer;
  };

  const sendEvent = useCallback((type: string, metadata?: Record<string, unknown>) => {
    if (endedRef.current || !attemptIdRef.current) return;
    socketRef.current?.emit('proctor:event', { attemptId: attemptIdRef.current, type, metadata });
  }, []);

  const stopAllMedia = useCallback(() => {
    for (const recorder of [cameraRecorderRef.current, screenRecorderRef.current]) {
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
    }
    for (const stream of [cameraStreamRef.current, screenStreamRef.current]) stream?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const writerCollection = writersRef.current;
    const localStore = storeRef.current;
    return () => {
      mountedRef.current = false;
      endedRef.current = true;
      draftRef.current?.dispose();
      const writers = [...writerCollection.values()];
      const stops = [cameraStopRef.current?.(), screenStopRef.current?.()].filter(Boolean);
      const release = releaseExamLockRef.current;
      releaseExamLockRef.current = null;
      stopAllMedia();
      void (async () => {
        await Promise.allSettled(stops);
        for (const writer of writers) {
          try {
            await writer.flushLocal();
            const local = await localStore.get(writer.id);
            if (local.state !== 'complete') await localStore.update(writer.id, { state: 'pending', interrupted: true });
          } catch { /* Persisted chunks remain recoverable; the page warned before closing with unsaved bytes. */ }
          await writer.close();
        }
        release?.();
      })();
    };
  }, [stopAllMedia]);

  useEffect(() => {
    if (!ownerId) return;
    void refreshLocal().catch(() => { if (mountedRef.current) setStartError('Жергілікті жазба қоймасы қолжетімсіз. Браузерді тексеріңіз.'); });
    void api.get(`/attempts/preflight/${examId}`).then(({ data }) => { if (mountedRef.current) setPreflight(data); }).catch((error) => { if (mountedRef.current) setStartError(error?.response?.data?.message || 'Емтихан параметрлерін жүктеу мүмкін болмады.'); });
  }, [examId, ownerId, refreshLocal]);

  // Capture permissions are requested from the button click, before starting the server timer.
  const begin = async () => {
    if (startingRef.current || attemptIdRef.current || !preflight || !ownerId) return;
    startingRef.current = true;
    setStarting(true);
    setStartError('');
    endedRef.current = false;
    setEnded(false);
    try {
      recordingBudget(preflight.remainingSeconds ?? preflight.duration * 60, preflight.recordingUsedBytes ?? 0);
      await acquireExamLock();
      if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Бұл браузер экран мен камера жазбасын қолдамайды. Жұмыс үстелі браузерін және HTTPS қолданыңыз.');
      }
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 10, max: 15 }, width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } }, audio: true });
      if (!mountedRef.current) { screen.getTracks().forEach((track) => track.stop()); return; }
      screenStreamRef.current = screen;
      const camera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 12, max: 15 } }, audio: true });
      if (!mountedRef.current) { camera.getTracks().forEach((track) => track.stop()); stopAllMedia(); return; }
      cameraStreamRef.current = camera;
      if (![screen, camera].every((stream) => stream.getVideoTracks().some((track) => track.readyState === 'live'))) {
        throw new Error('Камера мен экран бөлісуі қосулы болуы керек.');
      }
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((mime) => MediaRecorder.isTypeSupported(mime));
      if (!mimeType) throw new Error('Бұл браузер WebM жазбасын қолдамайды.');
      await storeRef.current.open();
      const estimate = await navigator.storage?.estimate?.();
      if (typeof estimate?.quota !== 'number' || typeof estimate?.usage !== 'number') throw new Error('Браузердегі бос орын бағасын тексеру мүмкін болмады.');
      const { data: latestPreflight } = await api.get(`/attempts/preflight/${examId}`);
      recordingBudget(latestPreflight.remainingSeconds ?? latestPreflight.duration * 60, latestPreflight.recordingUsedBytes ?? 0, estimate.quota - estimate.usage);
      if (!mountedRef.current) { stopAllMedia(); return; }
      setPreflight(latestPreflight);
      uploadedRef.current.clear();
      const cameraRecorder = new MediaRecorder(camera, { mimeType, videoBitsPerSecond: CAMERA_BITS, audioBitsPerSecond: AUDIO_BITS });
      const screenRecorder = new MediaRecorder(screen, { mimeType, videoBitsPerSecond: SCREEN_BITS, audioBitsPerSecond: AUDIO_BITS });
      // eslint-disable-next-line react-hooks/purity -- This start-button handler measures elapsed time after media permissions, never during render.
      const requestedAt = performance.now();
      const { data } = await api.post<Attempt>(`/attempts/start/${examId}`);
      if (!mountedRef.current) { stopAllMedia(); return; }
      const safeDraft = data.draft ?? { answers: [], revision: 0, updatedAt: null };
      answersRef.current = answerMap(safeDraft);
      setAnswers(answersRef.current);
      const saver = new ExamDraftSaver(safeDraft, async (value, signal) => {
        const response = await api.patch<ExamDraft>(`/attempts/${data.id}/draft`, value, { signal, timeout: 15000 });
        return response.data;
      }, (state) => {
        if (!mountedRef.current) return;
        setDraftState(state);
        if (state.status === 'closed') {
          endedRef.current = true;
          setEnded(true);
          setSubmissionFrozen(true);
          setSubmitError('Емтихан аяқталған немесе уақыты біткен. Сервердегі нәтиже сақталды; жазбалар жүктелгеннен кейін оны көре аласыз.');
          draftRef.current?.dispose();
          void uploadRecordings(data.id);
        }
      });
      draftRef.current = saver;
      setDraftState(saver.state);
      attemptIdRef.current = data.id;
      // eslint-disable-next-line react-hooks/purity -- Account for network time inside the explicit start-button handler.
      const now = performance.now();
      const remaining = Math.max(0, Date.parse(data.expiresAt) - Date.parse(data.serverTime) - (now - requestedAt));
      deadlineRef.current = now + remaining;
      setTimeLeft(Math.ceil(remaining / 1000));
      setTrustScore(data.trustScore);
      setAttempt(data);
      const startRecording = async (kind: 'camera' | 'screen', recorder: MediaRecorder) => {
        const session: LocalRecording = {
          id: crypto.randomUUID(), ownerId, examId, attemptId: data.id, kind, mimeType,
          state: 'recording', interrupted: false, nextIndex: 0, totalBytes: 0, uploadId: null, createdAt: Date.now(), updatedAt: Date.now(),
        };
        await storeRef.current.create(session);
        if (!mountedRef.current) { stopAllMedia(); return; }
        const writer = makeWriter(session, recorder);
        const stopped = observeRecorderStop(recorder);
        if (kind === 'camera') { cameraRecorderRef.current = recorder; cameraStopRef.current = stopped; cameraWriterRef.current = writer; }
        else { screenRecorderRef.current = recorder; screenStopRef.current = stopped; screenWriterRef.current = writer; }
        recorder.ondataavailable = ({ data: blob }) => { if (blob.size) void writer.append(blob).catch(() => {}); };
        recorder.onerror = () => {
          interruptedCaptureRef.current = true;
          void writer.markInterrupted().catch(() => {});
          if (mountedRef.current && !endedRef.current) setNotice('Жазба қатесі тіркелді. Сақталған бөліктер жоғалмайды; нәтиже тексеріледі.');
        };
        recorder.start(2000);
      };
      await startRecording('camera', cameraRecorder);
      await startRecording('screen', screenRecorder);
      if (!mountedRef.current) { stopAllMedia(); return; }
      await refreshLocal();
      const socket = io(`${WS_URL}/proctor`, { withCredentials: true, transports: ['websocket'] });
      socketRef.current = socket;
      socket.on('connect', () => socket.emit('proctor:start', { attemptId: data.id, role: 'student' }));
      socket.on('proctor:event:recorded', ({ trustScore: score }) => { if (mountedRef.current) setTrustScore(score); });
      socket.on('proctor:error', async ({ code, message }) => {
        if (code === 'UNAUTHORIZED' && !endedRef.current) {
          try {
            await api.get('/auth/me');
            if (endedRef.current || !mountedRef.current) return;
            socket.disconnect().connect();
          } catch { if (mountedRef.current) setNotice(message || 'Прокторинг байланысы үзілді.'); }
        } else if (mountedRef.current) setNotice(message || 'Прокторинг қатесі');
      });
      socket.on('connect_error', () => { if (mountedRef.current && !endedRef.current) setNotice('Прокторинг байланысы үзілді. Жауаптарды сақтауды жалғастырыңыз.'); });
      const screenEnded = () => {
        if (endedRef.current || !mountedRef.current) return;
        sendEvent('screen_share_stopped');
        interruptedCaptureRef.current = true;
        void screenWriterRef.current?.markInterrupted().catch(() => {});
        setNotice('Экран бөлісуі тоқтады. Бұл оқиға тексеріледі; жауаптарыңызды жіберуге болады.');
      };
      const screenTrack = screen.getVideoTracks()[0];
      if (screenTrack?.readyState === 'ended') screenEnded();
      else screenTrack?.addEventListener('ended', screenEnded, { once: true });
      const cameraEnded = () => {
        interruptedCaptureRef.current = true;
        void cameraWriterRef.current?.markInterrupted().catch(() => {});
        if (!endedRef.current && mountedRef.current) setNotice('Камера жазбасы тоқтады. Жауаптарыңызды жіберіңіз; нәтиже қосымша тексеріледі.');
      };
      const cameraTrack = camera.getVideoTracks()[0];
      if (cameraTrack?.readyState === 'ended') cameraEnded();
      else cameraTrack?.addEventListener('ended', cameraEnded, { once: true });
    } catch (error: any) {
      stopAllMedia();
      if (mountedRef.current) {
        const message = error?.response?.data?.message || (error?.name === 'NotAllowedError' ? 'Камера мен экранға рұқсат берілмеді. Жаңа емтихан таймері басталған жоқ.' : error?.message || 'Емтиханды бастау мүмкін болмады.');
        if (attemptIdRef.current) { interruptedCaptureRef.current = true; setNotice(message); setUploadError(true); }
        else setStartError(message);
      }
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  };

  useEffect(() => {
    if (attempt && videoRef.current) videoRef.current.srcObject = cameraStreamRef.current;
  }, [attempt]);

  useEffect(() => {
    if (!attempt) return;
    const visibility = () => {
      if (document.hidden && !endedRef.current) { sendEvent('tab_switch'); setNotice('Қойынды ауыстыру тіркелді. Оқиға тексеру кезінде қаралады.'); }
    };
    const copy = () => sendEvent('copy_paste', { action: 'copy' });
    const paste = () => sendEvent('paste', { action: 'paste' });
    const fullscreen = () => { if (!document.fullscreenElement) sendEvent('fullscreen_exit'); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!endedRef.current || uploadedRef.current.size < 2) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    const online = () => {
      if (!endedRef.current && draftRef.current?.state.status === 'offline') void draftRef.current.flush();
      for (const writer of writersRef.current.values()) void writer.retry().catch(() => {});
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('copy', copy);
    document.addEventListener('paste', paste);
    document.addEventListener('fullscreenchange', fullscreen);
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('online', online);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('copy', copy);
      document.removeEventListener('paste', paste);
      document.removeEventListener('fullscreenchange', fullscreen);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('online', online);
    };
  }, [attempt, sendEvent]);

  const uploadRecordings = useCallback(async (attemptId: string) => {
    if (uploadPromiseRef.current) return uploadPromiseRef.current;
    const work = async () => {
      if (mountedRef.current) { setUploading(true); setUploadError(false); }
      try {
        try {
          const stopping = Promise.allSettled([
            cameraStopRef.current?.() ?? stopRecorder(cameraRecorderRef.current),
            screenStopRef.current?.() ?? stopRecorder(screenRecorderRef.current),
          ]);
          // Release devices now, but wait for the final dataavailable events before sealing writers.
          stopAllMedia();
          const finished = await stopping;
          if (finished.some(({ status }) => status === 'rejected')) throw new Error('Recording did not finish');
        }
        finally { stopAllMedia(); }
        const upload = async (type: 'camera' | 'screen', writer: DurableRecording | null) => {
          if (uploadedRef.current.has(type)) return;
          if (!writer || (await storeRef.current.get(writer.id)).attemptId !== attemptId) throw new Error('Recording is unavailable');
          await writer.finish(interruptedCaptureRef.current);
          uploadedRef.current.add(type);
        };
        const results = await Promise.allSettled([upload('camera', cameraWriterRef.current), upload('screen', screenWriterRef.current)]);
        if (results.some(({ status }) => status === 'rejected')) throw new Error('Recording upload failed');
        await refreshLocal();
      } catch {
        if (mountedRef.current) setUploadError(true);
      } finally {
        if (mountedRef.current) setUploading(false);
      }
    };
    uploadPromiseRef.current = work();
    try { await uploadPromiseRef.current; } finally { uploadPromiseRef.current = null; }
  }, [stopAllMedia, refreshLocal]);

  const recoverRecording = async (session: LocalRecording, replaceAborted = false) => {
    if (recovering || startingRef.current || (attemptIdRef.current && !endedRef.current)) return;
    setRecovering(session.id);
    try {
      if (session.ownerId !== ownerId || session.examId !== examId) throw new Error('Жазба қолжетімсіз');
      await acquireExamLock();
      if (replaceAborted) {
        if (!window.confirm('Сақталған жазбаны жаңа жүктеу арқылы жібересіз бе? Ашық апелляцияда бір рет қосымша 512 MiB беріледі. Жергілікті көшірме сервер қабылдағанша сақталады.')) return;
        const previousId = session.id;
        await writersRef.current.get(previousId)?.close();
        session = await storeRef.current.cloneForRetry(previousId, crypto.randomUUID());
        const replacement = makeWriter(session);
        if (cameraWriterRef.current?.id === previousId) cameraWriterRef.current = replacement;
        if (screenWriterRef.current?.id === previousId) screenWriterRef.current = replacement;
        writersRef.current.delete(previousId);
        await refreshLocal();
      }
      const writer = writersRef.current.get(session.id) ?? makeWriter(session);
      await writer.finish(session.state === 'recording' || session.interrupted);
      if ([cameraWriterRef.current?.id, screenWriterRef.current?.id].includes(session.id)) uploadedRef.current.add(session.kind);
      if (uploadedRef.current.size === 2) setUploadError(false);
      await refreshLocal();
      toast.success('Жазба серверде сақталды');
    } catch (error: any) { toast.error(error?.message || 'Жазбаны қалпына келтіру мүмкін болмады'); }
    finally { if (mountedRef.current) setRecovering(null); }
  };

  const handleSubmit = useCallback(async () => {
    if (!attempt || startingRef.current || submittingRef.current || endedRef.current) return;
    if (draftRef.current?.state.status === 'conflict' && !submissionRef.current) {
      // eslint-disable-next-line react-hooks/purity -- Invoked by the submit button or deadline timer, never during render.
      if (performance.now() < deadlineRef.current) {
        setSubmitError('Басқа қойынды жауаптарды өзгертті. Алдымен сервердегі нұсқаны жүктеңіз.');
        return;
      }
      submittingRef.current = true;
      endedRef.current = true;
      setEnded(true); setSubmitting(true); setSubmissionFrozen(true);
      draftRef.current.dispose();
      try {
        const data = await finishExpiredConflict(
          async () => (await api.get<ExamDraft>(`/attempts/${attempt.id}/draft`)).data,
          async (savedAnswers) => (await api.post<ExamResult>(`/attempts/${attempt.id}/submit`, { answers: savedAnswers }, { timeout: 20000 })).data,
          () => uploadRecordings(attempt.id),
        );
        if (mountedRef.current) { setSubmitError(''); setResult(data); }
      } catch (error) {
        if (mountedRef.current) setSubmitError(isClosedExamError(error)
          ? 'Емтихан уақыты аяқталды. Сервердегі соңғы жауаптар бойынша нәтижені көріңіз.'
          : 'Емтихан уақыты аяқталды, жазба тоқтатылды. Байланыс қалпына келгенде нәтижелер бетін ашыңыз: серверде сақталған жауаптар есепке алынады.');
      } finally {
        submittingRef.current = false;
        if (mountedRef.current) setSubmitting(false);
      }
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    if (!submissionRef.current) submissionRef.current = answerList(answersRef.current);
    setSubmissionFrozen(true);
    // Submit carries the latest answers itself. Waiting on an offline autosave could miss the deadline.
    draftRef.current?.dispose();
    try {
      const { data } = await api.post<ExamResult>(`/attempts/${attempt.id}/submit`, { answers: submissionRef.current }, { timeout: 20000 });
      endedRef.current = true;
      if (mountedRef.current) setEnded(true);
      socketRef.current?.emit('proctor:end', { attemptId: attempt.id });
      if (mountedRef.current) setResult(data);
      await uploadRecordings(attempt.id);
    } catch (error: any) {
      if (isClosedExamError(error)) {
        endedRef.current = true;
        if (mountedRef.current) setEnded(true);
        if (mountedRef.current) setSubmitError(error?.response?.data?.message || 'Бұл емтихан жабылған. Нәтижені тексеріңіз.');
        await uploadRecordings(attempt.id);
      } else if (mountedRef.current) {
        setSubmitError('Жіберу расталмады. Жауаптарыңыз осы бетте сақталған; сол жауаптарды қайта жіберіңіз.');
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  }, [attempt, uploadRecordings]);
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

  useEffect(() => {
    if (!attempt || result || starting) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - performance.now()) / 1000));
      setTimeLeft(remaining);
      if (!remaining && !expirySubmittedRef.current) {
        expirySubmittedRef.current = true;
        // Capture expiry is independent of submission acknowledgement (or an in-flight manual submit).
        void uploadRecordings(attempt.id);
        void handleSubmitRef.current();
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [attempt, result, starting, uploadRecordings]);

  const updateAnswer = (questionId: string, answer: string) => {
    if (startingRef.current || submissionRef.current || endedRef.current || !timeLeft || draftRef.current?.state.status === 'conflict') return;
    const next = { ...answersRef.current, [questionId]: answer };
    answersRef.current = next;
    setAnswers(next);
    draftRef.current?.update(next);
  };

  const reloadDraft = async () => {
    if (!attempt || loadingDraft) return;
    if (!window.confirm('Осы беттегі сақталмаған өзгерістер сервердегі соңғы жауаптармен ауыстырылады. Жалғастыру керек пе?')) return;
    setLoadingDraft(true);
    try {
      const { data } = await api.get<ExamDraft>(`/attempts/${attempt.id}/draft`);
      draftRef.current?.replaceFromServer(data);
      answersRef.current = answerMap(data);
      setAnswers(answersRef.current);
      setSubmitError('');
    } catch (error) {
      if (isClosedExamError(error)) {
        endedRef.current = true;
        setEnded(true); setSubmissionFrozen(true);
        draftRef.current?.dispose();
        setSubmitError('Емтихан серверде аяқталған. Сақталған нәтижені көріңіз.');
        await uploadRecordings(attempt.id);
      } else toast.error('Сервердегі жауаптарды жүктеу мүмкін болмады.');
    }
    finally { if (mountedRef.current) setLoadingDraft(false); }
  };

  const recoveryPanel = localSessions.length > 0 && (
    <section className={`${styles.recordings} space-y-3`} aria-label="Жазбаларды сақтау">
      <h2 className="font-semibold">Жазбаларды сақтау</h2>
      <p className="text-sm text-gray-600">Жазбалар алдымен осы браузерде сақталады. Сервер қабылдағаннан кейін жергілікті бейне бөліктері өшіріледі. Қалпына келтіру үшін осы аккаунтпен осы браузерді ашыңыз.</p>
      {localSessions.map((session) => {
        const queue = queueStates[session.id];
        const live = !!attempt && !ended;
        const labels = { recording: 'Жазылуда', saving: 'Жергілікті сақтау', uploading: 'Серверге жүктелуде', offline: 'Байланысты күтуде', 'storage-error': 'Браузерге сақтау қатесі', error: 'Жүктеу қатесі', complete: 'Сақталды' };
        return <div key={session.id} className="border-t pt-3 flex flex-wrap justify-between items-center gap-3 text-sm">
          <div><p className="font-medium">{session.kind === 'camera' ? 'Камера' : 'Экран'} · {(session.totalBytes / 1024 / 1024).toFixed(1)} MiB</p><p>{queue ? labels[queue.status] : 'Қалпына келтіруге дайын'} · {new Date(session.createdAt).toLocaleString()}</p>{queue?.message && <p role="alert" className="text-amber-800">{queue.message}</p>}{session.interrupted && <p className="text-amber-700">Үзіліс бар, тексерушіге белгіленеді.</p>}</div>
          {live ? <button className="text-primary-700 underline" disabled={starting || !queue || !['storage-error', 'offline', 'error'].includes(queue.status)} onClick={() => void writersRef.current.get(session.id)?.retry().catch(() => {})}>Қайта сақтау</button> : <button className="btn-secondary text-sm" disabled={!!recovering || starting || uploading} onClick={() => void recoverRecording(session, queue?.code === 'UPLOAD_ABORTED')}>{recovering === session.id ? 'Жүктелуде...' : queue?.code === 'UPLOAD_ABORTED' ? 'Жаңа жүктеумен қалпына келтіру' : 'Қалпына келтіріп жүктеу'}</button>}
        </div>;
      })}
    </section>
  );

  if (!attempt) return (
    <main className={`${styles.exam} min-h-screen flex items-center justify-center px-4 py-10`}>
      <div className="card max-w-2xl w-full space-y-5">
        <p className="text-xs font-bold tracking-widest text-violet-700">PROCTOLEARN · ЕМТИХАН</p>
        <h1 className="text-3xl font-bold tracking-tight">Емтиханға дайындық</h1>
        <p className="text-gray-600">Камера, микрофон және экран жазбасы қажет. Экранды таңдаңыз, содан кейін камераға рұқсат беріңіз. Жаңа емтихан осы тексерулерден кейін басталады.</p>
        <p className="text-sm text-gray-500">Бұрын басталған емтиханның таймері жалғасады. Қайта ашқанда серверде сақталған жауаптар қалпына келеді.</p>
        <p className="text-sm text-gray-500">Камера мен экранға ортақ шек: 512 MiB. Браузердегі бос орын мен емтихан ұзақтығы бастау алдында тексеріледі{preflight ? ` (${preflight.duration} мин)` : ''}.</p>
        {startError && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-lg">{startError}</p>}
        <button onClick={begin} disabled={starting || !preflight || !!recovering} className="btn-primary w-full disabled:opacity-50">{starting ? 'Рұқсаттар тексерілуде...' : !preflight ? 'Параметрлер жүктелуде...' : 'Камера мен экранды қосып, бастау / жалғастыру'}</button>
        {recoveryPanel}
        <Link href="/dashboard/courses" className="block text-center text-primary-700">Курстарға оралу</Link>
      </div>
    </main>
  );

  const questions = attempt.exam.questions;
  const question = questions[currentQ];
  const disabled = starting || submissionFrozen || ended || !timeLeft || draftState.status === 'conflict' || loadingDraft;
  const minutes = `${Math.floor(timeLeft / 60)}`.padStart(2, '0');
  const seconds = `${timeLeft % 60}`.padStart(2, '0');
  const draftLabels: Record<DraftState['status'], string> = {
    saved: 'Жауаптар серверде сақталды', unsaved: 'Сақталмаған өзгерістер бар', saving: 'Жауаптар сақталуда...',
    offline: 'Байланыс жоқ: соңғы өзгерістер сақталмады', conflict: 'Басқа қойынды жауаптарды өзгертті',
    closed: 'Емтихан серверде аяқталған', error: 'Жауаптарды сақтау мүмкін болмады', stopped: 'Жауаптар жіберуге бекітілді',
  };

  return (
    <main className={`${styles.exam} min-h-screen`}>
      <a href="#exam-question" className={styles.skipLink}>Сұраққа өту</a>
      <header className={`${styles.header} bg-white border-b sticky top-0 z-10`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3 sm:px-6">
          <div className="min-w-0 flex-1 basis-48"><p className="mb-1 text-[11px] font-bold tracking-widest text-violet-700">PROCTOLEARN · ЕМТИХАН</p><h1 className="break-words font-semibold">{attempt.exam.title}</h1><p className="text-sm text-slate-600">Сұрақ {currentQ + 1} / {questions.length}</p></div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="text-center"><p className="text-xs text-gray-500">Trust Score</p><p className="font-bold">{trustScore}</p></div>
            <div className={`${styles.timer} ${timeLeft < 60 ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-900'}`} role="timer" aria-label={`Қалған уақыт: ${minutes}:${seconds}`}><p className="text-xs">Қалған уақыт</p><p className="font-mono text-2xl font-bold tabular-nums">{minutes}:{seconds}</p></div>
            <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => toast.error('Толық экран қолжетімсіз'))} className="btn-secondary text-sm">Толық экран</button>
            <button disabled={submitting || ended || !!result || draftState.status === 'conflict'} onClick={() => { if (window.confirm('Жауаптарды жіберіп, емтиханды аяқтайсыз ба?')) void handleSubmit(); }} className="min-h-11 bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-red-800 disabled:opacity-50">Аяқтау</button>
          </div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto p-4 space-y-4 sm:p-6">
        {recoveryPanel}
        <div role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 text-sm flex flex-wrap items-center gap-3">
          <span>{submissionFrozen ? 'Жауаптар жіберуге бекітілді' : draftLabels[draftState.status]}</span>
          {!submissionFrozen && draftState.status === 'saved' && draftState.updatedAt && <time dateTime={draftState.updatedAt}>{new Date(draftState.updatedAt).toLocaleTimeString()}</time>}
          {!submissionFrozen && ['offline', 'error'].includes(draftState.status) && <button className="text-primary-700 underline" onClick={() => void draftRef.current?.flush()}>Қайта сақтау</button>}
          {draftState.status === 'conflict' && <button disabled={loadingDraft} className="text-primary-700 underline" onClick={() => void reloadDraft()}>Сервердегі нұсқаны жүктеу</button>}
        </div>
        {notice && <div role="status" className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">{notice}<button className="ml-3 underline" onClick={() => setNotice('')}>Жабу</button></div>}
        {trustScore <= 0 && <p className="bg-amber-50 p-3 rounded-lg text-sm">Оқиғалар қосымша тексеруді қажет етеді. Жауаптарыңызды жіберуге болады; шешімді тексеруші қабылдайды.</p>}
        {submitError && <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3"><p>{submitError}</p>{!ended ? <button className="btn-primary" disabled={submitting || draftState.status === 'conflict'} onClick={() => void handleSubmit()}>Сол жауаптарды қайта жіберу</button> : <button disabled={uploading || uploadError} className="text-primary-700 underline disabled:opacity-50" onClick={() => router.push('/dashboard/my-attempts')}>Нәтижелерді көру</button>}</div>}
        {uploading && <p role="status" className="bg-blue-50 p-3 rounded-lg">Жауаптар сақталды. Камера мен экран жазбалары жүктелуде. Бетті жаппаңыз.</p>}
        {uploadError && <div role="alert" className="bg-amber-50 p-4 rounded-lg space-y-2"><p>Жазбаларды жүктеу аяқталмады. Қайта көріңіз немесе осы браузерде осы емтиханды ашып, сақталған бөліктерді қалпына келтіріңіз. Браузерге сақтау қатесі болса, бетті жаппаңыз. Сертификат тексеруден кейін беріледі.</p><button disabled={uploading} onClick={() => void uploadRecordings(attempt.id)} className="btn-secondary">Жазбаларды қайта жүктеу</button></div>}
        {result ? (
          <section className="card max-w-2xl mx-auto space-y-4 text-center" aria-label="Емтихан нәтижесі">
            <h2 className="text-2xl font-bold">Жауаптар қабылданды</h2>
            <p className="text-5xl font-semibold tracking-tight text-violet-700">{result.score}%</p>
            <p>{result.passed ? 'Өту балы жиналды. Нәтиже мен жазбалар тексерушінің растауын күтеді.' : 'Өту балы жиналмады. Нәтижені жеке кабинеттен көре аласыз.'}</p>
            {result.passed && <p className="text-sm text-gray-600">Сертификат тек тексеру мақұлданып, қажетті жазбалар қабылданғаннан кейін беріледі.</p>}
            <button disabled={uploading || uploadError} onClick={() => router.push('/dashboard/my-attempts')} className="btn-primary disabled:opacity-50">Нәтижелерге өту</button>
          </section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
            <aside className="card"><h2 className="font-semibold mb-2">Сұрақтар</h2><p className="mb-3 text-sm text-slate-600">Жауап берілді: {questions.filter((item) => !!answers[item.id]).length} / {questions.length}</p><progress className={styles.progress} aria-label="Жауап берілген сұрақтар" value={questions.filter((item) => !!answers[item.id]).length} max={questions.length || 1} /><div className="mt-4 grid grid-cols-5 lg:grid-cols-4 gap-2">{questions.map((item, index) => <button key={item.id} aria-label={`${index + 1}-сұрақ${answers[item.id] ? ', жауап берілді' : ', жауап берілмеді'}`} aria-current={index === currentQ ? 'step' : undefined} onClick={() => setCurrentQ(index)} className={`relative min-h-11 rounded-xl border text-sm font-semibold ${index === currentQ ? 'border-violet-700 bg-violet-700 text-white' : answers[item.id] ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}>{index + 1}{answers[item.id] && <span aria-hidden="true" className="absolute right-1 top-0 text-[10px]">✓</span>}</button>)}</div><video ref={videoRef} autoPlay muted playsInline aria-label="Камераның алдын ала көрінісі" className="mt-5 rounded-xl w-full bg-slate-950" /><p className="text-xs leading-5 text-slate-600 mt-2">Камера және экран жазылады. Жазбалардың күйі жоғарыда көрсетілген.</p></aside>
            <section id="exam-question" tabIndex={-1} className={`${styles.question} card lg:col-span-3`}>
              {question ? <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{currentQ + 1}-сұрақ · {question.type === 'MULTIPLE_CHOICE' ? 'Бірнеше жауап таңдаңыз' : question.type === 'SINGLE_CHOICE' ? 'Бір жауап таңдаңыз' : 'Мәтіндік жауап'}</p>
                <h2 className="text-xl sm:text-2xl leading-relaxed font-semibold whitespace-pre-wrap break-words mb-6">{question.text}</h2>
                <fieldset disabled={disabled} className="space-y-3 min-w-0">
                  <legend className="sr-only">{question.text}</legend>
                  {question.type === 'SINGLE_CHOICE' && question.options?.map((option, index) => <label key={index} className={`${styles.option} flex items-start gap-3 p-4 rounded-xl border-2 ${answers[question.id] === option ? 'border-violet-600 bg-violet-50' : 'border-slate-200 bg-white'}`}><input type="radio" name={`q-${question.id}`} checked={answers[question.id] === option} onChange={() => updateAnswer(question.id, option)} className="mt-1 h-5 w-5 shrink-0 accent-violet-700" /><span className="min-w-0 whitespace-pre-wrap break-words leading-7">{option}</span></label>)}
                  {question.type === 'MULTIPLE_CHOICE' && question.options?.map((option, index) => {
                    const selected = selectedOptions(answers[question.id]);
                    return <label key={index} className={`${styles.option} flex items-start gap-3 p-4 rounded-xl border-2 ${selected.includes(option) ? 'border-violet-600 bg-violet-50' : 'border-slate-200 bg-white'}`}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => { const next = event.target.checked ? [...selected, option] : selected.filter((item) => item !== option); updateAnswer(question.id, next.length ? JSON.stringify(next) : ''); }} className="mt-1 h-5 w-5 shrink-0 accent-violet-700" /><span className="min-w-0 whitespace-pre-wrap break-words leading-7">{option}</span></label>;
                  })}
                  {question.type === 'TEXT' && <textarea aria-label="Жауап" maxLength={10000} className="input min-h-[200px] resize-y text-base leading-7" value={answers[question.id] ?? ''} onChange={(event) => updateAnswer(question.id, event.target.value)} placeholder="Жауабыңызды теріңіз..." />}
                </fieldset>
                <div className="flex flex-wrap justify-between gap-3 mt-8"><button className="btn-secondary" disabled={!currentQ} onClick={() => setCurrentQ((index) => Math.max(0, index - 1))}>← Алдыңғы</button>{currentQ < questions.length - 1 ? <button className="btn-primary" onClick={() => setCurrentQ((index) => index + 1)}>Келесі →</button> : <button disabled={submitting || draftState.status === 'conflict' || ended} className="btn-primary disabled:opacity-50" onClick={() => void handleSubmit()}>{submitting ? 'Жіберілуде...' : submissionFrozen ? 'Қайта жіберу' : 'Жауаптарды жіберу'}</button>}</div>
              </> : <p>Емтихан сұрақтары табылмады.</p>}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
