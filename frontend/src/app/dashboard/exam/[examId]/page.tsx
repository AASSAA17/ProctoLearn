'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import api, { WS_URL } from '@/lib/api';
import { observeRecorderStop, stopRecorder } from '@/lib/recording';
import { answerList, answerMap, DraftAnswer, DraftState, ExamDraft, ExamDraftSaver } from '@/lib/exam-draft';
import toast from 'react-hot-toast';

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
  const router = useRouter();
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
  const cameraChunksRef = useRef<Blob[]>([]);
  const screenChunksRef = useRef<Blob[]>([]);
  const uploadedRef = useRef(new Set<string>());
  const uploadPromiseRef = useRef<Promise<void> | null>(null);
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {});

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
    return () => {
      mountedRef.current = false;
      endedRef.current = true;
      draftRef.current?.dispose();
      stopAllMedia();
    };
  }, [stopAllMedia]);

  // Capture permissions are requested from the button click, before starting the server timer.
  const begin = async () => {
    if (startingRef.current || attemptIdRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError('');
    endedRef.current = false;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Бұл браузер экран мен камера жазбасын қолдамайды. Жұмыс үстелі браузерін және HTTPS қолданыңыз.');
      }
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!mountedRef.current) { screen.getTracks().forEach((track) => track.stop()); return; }
      screenStreamRef.current = screen;
      const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!mountedRef.current) { camera.getTracks().forEach((track) => track.stop()); stopAllMedia(); return; }
      cameraStreamRef.current = camera;
      if (![screen, camera].every((stream) => stream.getVideoTracks().some((track) => track.readyState === 'live'))) {
        throw new Error('Камера мен экран бөлісуі қосулы болуы керек.');
      }
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((mime) => MediaRecorder.isTypeSupported(mime));
      if (!mimeType) throw new Error('Бұл браузер WebM жазбасын қолдамайды.');
      cameraChunksRef.current = [];
      screenChunksRef.current = [];
      uploadedRef.current.clear();
      const record = (stream: MediaStream, chunks: React.RefObject<Blob[]>, stopped: React.RefObject<(() => Promise<void>) | null>) => {
        const recorder = new MediaRecorder(stream, { mimeType });
        stopped.current = observeRecorderStop(recorder);
        recorder.ondataavailable = ({ data }) => { if (data.size) chunks.current.push(data); };
        recorder.onerror = () => { if (mountedRef.current && !endedRef.current) setNotice('Жазба қатесі тіркелді. Жауаптарыңызды жіберуге болады; нәтиже тексеріледі.'); };
        recorder.start(10000);
        return recorder;
      };
      cameraRecorderRef.current = record(camera, cameraChunksRef, cameraStopRef);
      screenRecorderRef.current = record(screen, screenChunksRef, screenStopRef);
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
          setSubmissionFrozen(true);
          setSubmitError('Емтихан аяқталған немесе уақыты біткен. Сервердегі нәтиже сақталды; жазбалар жүктелгеннен кейін оны көре аласыз.');
          draftRef.current?.dispose();
          void uploadRecordings(data.id);
        }
      });
      draftRef.current = saver;
      setDraftState(saver.state);
      attemptIdRef.current = data.id;
      const remaining = Math.max(0, Date.parse(data.expiresAt) - Date.parse(data.serverTime) - (performance.now() - requestedAt));
      deadlineRef.current = performance.now() + remaining;
      setTimeLeft(Math.ceil(remaining / 1000));
      setTrustScore(data.trustScore);
      setAttempt(data);
      const socket = io(`${WS_URL}/proctor`, { auth: { token: localStorage.getItem('accessToken') }, transports: ['websocket'] });
      socketRef.current = socket;
      socket.on('connect', () => socket.emit('proctor:start', { attemptId: data.id, role: 'student' }));
      socket.on('proctor:event:recorded', ({ trustScore: score }) => { if (mountedRef.current) setTrustScore(score); });
      socket.on('proctor:error', async ({ code, message }) => {
        if (code === 'UNAUTHORIZED' && !endedRef.current) {
          try {
            await api.get('/auth/me');
            if (endedRef.current || !mountedRef.current) return;
            socket.auth = { token: localStorage.getItem('accessToken') };
            socket.connect();
          } catch { if (mountedRef.current) setNotice(message || 'Прокторинг байланысы үзілді.'); }
        } else if (mountedRef.current) setNotice(message || 'Прокторинг қатесі');
      });
      socket.on('connect_error', () => { if (mountedRef.current && !endedRef.current) setNotice('Прокторинг байланысы үзілді. Жауаптарды сақтауды жалғастырыңыз.'); });
      const screenEnded = () => {
        if (endedRef.current || !mountedRef.current) return;
        sendEvent('screen_share_stopped');
        setNotice('Экран бөлісуі тоқтады. Бұл оқиға тексеріледі; жауаптарыңызды жіберуге болады.');
      };
      const screenTrack = screen.getVideoTracks()[0];
      if (screenTrack?.readyState === 'ended') screenEnded();
      else screenTrack?.addEventListener('ended', screenEnded, { once: true });
      const cameraEnded = () => {
        if (!endedRef.current && mountedRef.current) setNotice('Камера жазбасы тоқтады. Жауаптарыңызды жіберіңіз; нәтиже қосымша тексеріледі.');
      };
      const cameraTrack = camera.getVideoTracks()[0];
      if (cameraTrack?.readyState === 'ended') cameraEnded();
      else cameraTrack?.addEventListener('ended', cameraEnded, { once: true });
    } catch (error: any) {
      stopAllMedia();
      if (mountedRef.current) setStartError(error?.response?.data?.message || (error?.name === 'NotAllowedError' ? 'Камера мен экранға рұқсат берілмеді. Жаңа емтихан таймері басталған жоқ.' : error?.message || 'Емтиханды бастау мүмкін болмады.'));
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
    const online = () => { if (!endedRef.current && draftRef.current?.state.status === 'offline') void draftRef.current.flush(); };
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
          const finished = await Promise.allSettled([
            cameraStopRef.current?.() ?? stopRecorder(cameraRecorderRef.current),
            screenStopRef.current?.() ?? stopRecorder(screenRecorderRef.current),
          ]);
          if (finished.some(({ status }) => status === 'rejected')) throw new Error('Recording did not finish');
        }
        finally { stopAllMedia(); }
        const upload = async (type: 'camera' | 'screen', chunks: Blob[]) => {
          if (uploadedRef.current.has(type)) return;
          if (!chunks.length) throw new Error('Recording is empty');
          const form = new FormData();
          form.append('file', new Blob(chunks, { type: 'video/webm' }), `${type}.webm`);
          form.append('type', type);
          await api.post(`/evidence/${attemptId}/recording`, form, { headers: { 'Content-Type': undefined }, timeout: 120000 });
          uploadedRef.current.add(type);
        };
        const results = await Promise.allSettled([upload('camera', cameraChunksRef.current), upload('screen', screenChunksRef.current)]);
        if (results.some(({ status }) => status === 'rejected')) throw new Error('Recording upload failed');
        cameraChunksRef.current = [];
        screenChunksRef.current = [];
      } catch {
        if (mountedRef.current) setUploadError(true);
      } finally {
        if (mountedRef.current) setUploading(false);
      }
    };
    uploadPromiseRef.current = work();
    try { await uploadPromiseRef.current; } finally { uploadPromiseRef.current = null; }
  }, [stopAllMedia]);

  const handleSubmit = useCallback(async () => {
    if (!attempt || submittingRef.current || endedRef.current) return;
    if (draftRef.current?.state.status === 'conflict' && !submissionRef.current) {
      setSubmitError('Басқа қойынды жауаптарды өзгертті. Алдымен сервердегі нұсқаны жүктеңіз.');
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
      socketRef.current?.emit('proctor:end', { attemptId: attempt.id });
      if (mountedRef.current) setResult(data);
      await uploadRecordings(attempt.id);
    } catch (error: any) {
      const code = error?.response?.data?.code;
      if (['EXAM_EXPIRED', 'ATTEMPT_CLOSED', 'SUBMISSION_CONFLICT'].includes(code)) {
        endedRef.current = true;
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
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (!attempt || result) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - performance.now()) / 1000));
      setTimeLeft(remaining);
      if (!remaining && !expirySubmittedRef.current) { expirySubmittedRef.current = true; void handleSubmitRef.current(); }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [attempt, result]);

  const updateAnswer = (questionId: string, answer: string) => {
    if (submissionRef.current || endedRef.current || !timeLeft || draftRef.current?.state.status === 'conflict') return;
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
    } catch { toast.error('Сервердегі жауаптарды жүктеу мүмкін болмады.'); }
    finally { if (mountedRef.current) setLoadingDraft(false); }
  };

  if (!attempt) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="card max-w-xl w-full space-y-5">
        <h1 className="text-2xl font-bold">Емтиханға дайындық</h1>
        <p className="text-gray-600">Камера, микрофон және экран жазбасы қажет. Экранды таңдаңыз, содан кейін камераға рұқсат беріңіз. Жаңа емтихан осы тексерулерден кейін басталады.</p>
        <p className="text-sm text-gray-500">Бұрын басталған емтиханның таймері жалғасады. Қайта ашқанда серверде сақталған жауаптар қалпына келеді.</p>
        {startError && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-lg">{startError}</p>}
        <button onClick={begin} disabled={starting} className="btn-primary w-full disabled:opacity-50">{starting ? 'Рұқсаттар тексерілуде...' : 'Камера мен экранды қосып, бастау / жалғастыру'}</button>
        <Link href="/dashboard/courses" className="block text-center text-primary-700">Курстарға оралу</Link>
      </div>
    </main>
  );

  const questions = attempt.exam.questions;
  const question = questions[currentQ];
  const disabled = submissionFrozen || endedRef.current || !timeLeft || draftState.status === 'conflict' || loadingDraft;
  const minutes = `${Math.floor(timeLeft / 60)}`.padStart(2, '0');
  const seconds = `${timeLeft % 60}`.padStart(2, '0');
  const draftLabels: Record<DraftState['status'], string> = {
    saved: 'Жауаптар серверде сақталды', unsaved: 'Сақталмаған өзгерістер бар', saving: 'Жауаптар сақталуда...',
    offline: 'Байланыс жоқ: соңғы өзгерістер сақталмады', conflict: 'Басқа қойынды жауаптарды өзгертті',
    closed: 'Емтихан серверде аяқталған', error: 'Жауаптарды сақтау мүмкін болмады', stopped: 'Жауаптар жіберуге бекітілді',
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="font-bold">{attempt.exam.title}</h1><p className="text-sm text-gray-500">Сұрақ {currentQ + 1} / {questions.length}</p></div>
          <div className="flex items-center gap-4">
            <div className="text-center"><p className="text-xs text-gray-500">Trust Score</p><p className="font-bold">{trustScore}</p></div>
            <div className={timeLeft < 60 ? 'text-red-600' : 'text-gray-800'}><p className="text-xs">Қалған уақыт</p><p className="font-mono text-2xl font-bold">{minutes}:{seconds}</p></div>
            <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => toast.error('Толық экран қолжетімсіз'))} className="btn-secondary text-sm">Толық экран</button>
            <button disabled={submitting || endedRef.current || !!result || draftState.status === 'conflict'} onClick={() => { if (window.confirm('Жауаптарды жіберіп, емтиханды аяқтайсыз ба?')) void handleSubmit(); }} className="bg-red-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">Аяқтау</button>
          </div>
        </div>
      </header>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div role="status" aria-live="polite" className="rounded-lg border bg-white p-3 text-sm flex flex-wrap items-center gap-3">
          <span>{submissionFrozen ? 'Жауаптар жіберуге бекітілді' : draftLabels[draftState.status]}</span>
          {!submissionFrozen && draftState.status === 'saved' && draftState.updatedAt && <time dateTime={draftState.updatedAt}>{new Date(draftState.updatedAt).toLocaleTimeString()}</time>}
          {!submissionFrozen && ['offline', 'error'].includes(draftState.status) && <button className="text-primary-700 underline" onClick={() => void draftRef.current?.flush()}>Қайта сақтау</button>}
          {draftState.status === 'conflict' && <button disabled={loadingDraft} className="text-primary-700 underline" onClick={() => void reloadDraft()}>Сервердегі нұсқаны жүктеу</button>}
        </div>
        {notice && <div role="status" className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">{notice}<button className="ml-3 underline" onClick={() => setNotice('')}>Жабу</button></div>}
        {trustScore <= 0 && <p className="bg-amber-50 p-3 rounded-lg text-sm">Оқиғалар қосымша тексеруді қажет етеді. Жауаптарыңызды жіберуге болады; шешімді тексеруші қабылдайды.</p>}
        {submitError && <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3"><p>{submitError}</p>{!endedRef.current ? <button className="btn-primary" disabled={submitting || draftState.status === 'conflict'} onClick={() => void handleSubmit()}>Сол жауаптарды қайта жіберу</button> : <button disabled={uploading || uploadError} className="text-primary-700 underline disabled:opacity-50" onClick={() => router.push('/dashboard/my-attempts')}>Нәтижелерді көру</button>}</div>}
        {uploading && <p role="status" className="bg-blue-50 p-3 rounded-lg">Жауаптар сақталды. Камера мен экран жазбалары жүктелуде. Бетті жаппаңыз.</p>}
        {uploadError && <div role="alert" className="bg-amber-50 p-4 rounded-lg space-y-2"><p>Жазбаларды жүктеу аяқталмады. Осы бетті жаппай қайта жүктеңіз; сертификат тексеруден кейін беріледі.</p><button disabled={uploading} onClick={() => void uploadRecordings(attempt.id)} className="btn-secondary">Жазбаларды қайта жүктеу</button></div>}
        {result ? (
          <section className="card max-w-2xl mx-auto space-y-4 text-center">
            <h2 className="text-2xl font-bold">Жауаптар қабылданды</h2>
            <p className="text-3xl font-semibold">{result.score}%</p>
            <p>{result.passed ? 'Өту балы жиналды. Нәтиже мен жазбалар тексерушінің растауын күтеді.' : 'Өту балы жиналмады. Нәтижені жеке кабинеттен көре аласыз.'}</p>
            {result.passed && <p className="text-sm text-gray-600">Сертификат тек тексеру мақұлданып, қажетті жазбалар қабылданғаннан кейін беріледі.</p>}
            <button disabled={uploading || uploadError} onClick={() => router.push('/dashboard/my-attempts')} className="btn-primary disabled:opacity-50">Нәтижелерге өту</button>
          </section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <aside className="card"><h2 className="font-semibold mb-3">Сұрақтар</h2><div className="grid grid-cols-5 lg:grid-cols-4 gap-2">{questions.map((item, index) => <button key={item.id} aria-label={`${index + 1}-сұрақ`} aria-current={index === currentQ ? 'step' : undefined} onClick={() => setCurrentQ(index)} className={`h-9 rounded text-sm ${index === currentQ ? 'bg-primary-600 text-white' : answers[item.id] ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{index + 1}</button>)}</div><video ref={videoRef} autoPlay muted playsInline className="mt-4 rounded-lg w-full" /><p className="text-xs text-gray-500 mt-2">Камера және экран жазылады.</p></aside>
            <section className="card lg:col-span-3">
              {question ? <>
                <h2 className="text-xl font-semibold whitespace-pre-wrap mb-6">{question.text}</h2>
                <fieldset disabled={disabled} className="space-y-3 min-w-0">
                  <legend className="sr-only">{question.text}</legend>
                  {question.type === 'SINGLE_CHOICE' && question.options?.map((option, index) => <label key={index} className={`flex items-start gap-3 p-4 rounded-lg border-2 ${answers[question.id] === option ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}><input type="radio" name={`q-${question.id}`} checked={answers[question.id] === option} onChange={() => updateAnswer(question.id, option)} className="mt-1" /><span className="whitespace-pre-wrap break-words">{option}</span></label>)}
                  {question.type === 'MULTIPLE_CHOICE' && question.options?.map((option, index) => {
                    const selected = selectedOptions(answers[question.id]);
                    return <label key={index} className={`flex items-start gap-3 p-4 rounded-lg border-2 ${selected.includes(option) ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => { const next = event.target.checked ? [...selected, option] : selected.filter((item) => item !== option); updateAnswer(question.id, next.length ? JSON.stringify(next) : ''); }} className="mt-1" /><span className="whitespace-pre-wrap break-words">{option}</span></label>;
                  })}
                  {question.type === 'TEXT' && <textarea aria-label="Жауап" maxLength={10000} className="input min-h-[140px]" value={answers[question.id] ?? ''} onChange={(event) => updateAnswer(question.id, event.target.value)} placeholder="Жауабыңызды теріңіз..." />}
                </fieldset>
                <div className="flex flex-wrap justify-between gap-3 mt-8"><button className="btn-secondary" disabled={!currentQ} onClick={() => setCurrentQ((index) => Math.max(0, index - 1))}>← Алдыңғы</button>{currentQ < questions.length - 1 ? <button className="btn-primary" onClick={() => setCurrentQ((index) => index + 1)}>Келесі →</button> : <button disabled={submitting || draftState.status === 'conflict' || endedRef.current} className="btn-primary disabled:opacity-50" onClick={() => void handleSubmit()}>{submitting ? 'Жіберілуде...' : submissionFrozen ? 'Қайта жіберу' : 'Жауаптарды жіберу'}</button>}</div>
              </> : <p>Емтихан сұрақтары табылмады.</p>}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
