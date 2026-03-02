'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';

interface Question {
  id: string;
  text: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT';
  options: string[] | null;
}

interface Exam {
  id: string;
  title: string;
  duration: number;
  passScore: number;
  questions: Question[];
}

interface Attempt {
  id: string;
  trustScore: number;
  exam: Exam;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

export default function ExamPage() {
  const { examId } = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [trustScore, setTrustScore] = useState(100);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [tabBlocked, setTabBlocked] = useState(false);
  const tabSwitchCountRef = useRef(0);

  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const faceCheckRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  // Video recording refs
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);
  const screenChunksRef = useRef<Blob[]>([]);

  const sendEvent = useCallback((type: string, metadata?: Record<string, any>) => {
    socketRef.current?.emit('proctor:event', {
      attemptId: attemptIdRef.current ?? attempt?.id,
      type,
      metadata,
    });
  }, [attempt?.id]);

  // Stop all media streams, recorders, and clear intervals
  const stopAllMedia = useCallback(() => {
    clearInterval(faceCheckRef.current);
    clearInterval(timerRef.current);
    // Stop recorders
    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
      cameraRecorderRef.current.stop();
    }
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      screenRecorderRef.current.stop();
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    // Stop camera
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    // Stop screen share
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Setup camera + start recording
  const setupCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
      // Start camera recorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      cameraChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) cameraChunksRef.current.push(e.data); };
      recorder.start(10000); // chunk every 10s
      cameraRecorderRef.current = recorder;
    } catch {
      console.warn('Camera not available');
    }
  };

  // Setup screen sharing + start recording
  const setupScreenShare = useCallback(async (attemptId: string) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      // Start screen recorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      screenChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      recorder.start(10000);
      screenRecorderRef.current = recorder;
      // Detect if user stops sharing
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        sendEvent('screen_share_stopped', { timestamp: new Date().toISOString() });
        toast.error('Экран бөлісуді тоқтаттыңыз! -10 Trust Score', { duration: 4000 });
        screenStreamRef.current = null;
      });
    } catch {
      sendEvent('screen_share_denied', { timestamp: new Date().toISOString() });
      toast.error('Экранды бөлісу талап етіледі', { duration: 4000 });
    }
  }, [sendEvent]);

  // Upload recordings (fire-and-forget)
  const uploadRecordings = useCallback((attemptId: string) => {
    const uploadBlob = async (chunks: Blob[], type: 'camera' | 'screen') => {
      if (chunks.length === 0) return;
      try {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const formData = new FormData();
        formData.append('file', blob, `${type}.webm`);
        formData.append('type', type);
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/evidence/${attemptId}/recording`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
          body: formData,
        });
      } catch { /* silent */ }
    };
    void uploadBlob([...cameraChunksRef.current], 'camera');
    void uploadBlob([...screenChunksRef.current], 'screen');
  }, []);

  // Detect face in camera canvas
  const checkFace = useCallback(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (video.readyState < 2) return; // not ready

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    if (canvas.width === 0 || canvas.height === 0) return;

    ctx.drawImage(video, 0, 0);

    // Simple brightness heuristic: if very dark or blank, no face
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);

    if (avgBrightness < 10) {
      // Camera feed is basically black — likely no face / camera blocked
      sendEvent('face_not_detected', { reason: 'dark_frame', brightness: avgBrightness });
      toast.error('Бет анықталмады! -5 Trust Score', { duration: 3000 });
    }
  }, [sendEvent]);

  // Proctoring event listeners
  useEffect(() => {
    if (!attempt) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabSwitchCountRef.current += 1;
        sendEvent('tab_switch', { timestamp: new Date().toISOString(), count: tabSwitchCountRef.current });
        toast.error('Қойынды ауыстыру тіркелді! -10 Trust Score', { duration: 3000 });
        setTabBlocked(true);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Емтиханнан шығуға сенімдісіз бе?';
    };

    const handleCopy = () => {
      sendEvent('copy_paste', { action: 'copy' });
      toast.error('Көшіру тіркелді! -15 Trust Score', { duration: 3000 });
    };

    const handlePaste = () => {
      sendEvent('paste', { action: 'paste' });
      toast.error('Қоюу тіркелді! -15 Trust Score', { duration: 3000 });
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        sendEvent('fullscreen_exit');
        toast.error('Толық экраннан шыктыңыз! -5 Trust Score', { duration: 3000 });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Try to enter fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {});

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [attempt, sendEvent]);

  // Initialize exam
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await api.post(`/attempts/start/${examId}`);
        setAttempt(data);
        attemptIdRef.current = data.id;
        setTrustScore(data.trustScore);
        setTimeLeft(data.exam.duration * 60);

        // Initialize socket
        const token = localStorage.getItem('accessToken');
        const socket = io(`${WS_URL}/proctor`, {
          auth: { token },
          transports: ['websocket'],
        });

        socket.on('connect', () => {
          socket.emit('proctor:start', { attemptId: data.id, role: 'student' });
        });

        socket.on('proctor:event:recorded', ({ trustScore: ts }) => {
          setTrustScore(ts);
        });

        socketRef.current = socket;

        await setupCamera();
        await setupScreenShare(data.id);

        // Face check every 15 seconds (no more screenshots)
        faceCheckRef.current = setInterval(checkFace, 15000);
      } catch (err: any) {
        toast.error('Емтиханды бастау қатесі');
        router.push('/dashboard/courses');
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      stopAllMedia();
    };
  }, [examId]);

  // Timer
  useEffect(() => {
    if (!attempt || timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [attempt]);

  const handleSubmit = async () => {
    if (!attempt || submitting) return;
    setSubmitting(true);

    const answerList = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
    }));

    try {
      socketRef.current?.emit('proctor:end', { attemptId: attempt.id });
      const { data } = await api.post(`/attempts/${attempt.id}/submit`, {
        answers: answerList,
      });

      // Upload recordings (fire-and-forget)
      uploadRecordings(attempt.id);

      // Stop camera and screen share immediately before navigating
      stopAllMedia();

      if (data.passed) {
        toast.success(`Сіз өттіңіз! Балл: ${data.score}% 🎉`);
        router.push('/dashboard/certificates');
      } else {
        toast.error(`Өтпедіңіз. Балл: ${data.score}%`);
        router.push('/dashboard/my-attempts');
      }
    } catch {
      toast.error('Жіберу қатесі');
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const trustColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Емтихан жүктелуде...</p>
        </div>
      </div>
    );
  }

  if (!attempt) return null;

  const questions = attempt.exam.questions;
  const question = questions[currentQ];

  return (
    <>
      {/* Tab switch blocking overlay */}
      {tabBlocked && (
        <div className="fixed inset-0 bg-red-900/95 z-50 flex flex-col items-center justify-center">
          <div className="text-center text-white p-8 max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-2">Қойынды ауыстыру тіркелді!</h2>
            <p className="text-red-200 mb-2">Бұл оқиға проктор мен әкімшіге жіберілді.</p>
            <p className="text-red-200 mb-6">Жалпы саны: {tabSwitchCountRef.current} рет</p>
            <button
              onClick={() => setTabBlocked(false)}
              className="bg-white text-red-900 font-bold px-8 py-3 rounded-lg hover:bg-red-100 transition-colors"
            >
              Емтиханға оралу →
            </button>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-900">{attempt.exam.title}</h1>
            <p className="text-sm text-gray-500">
              Сұрақ {currentQ + 1} / {questions.length}
            </p>
          </div>

          <div className="flex items-center gap-6">
            {/* Trust Score */}
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Trust Score</p>
              <div className="flex items-center gap-2">
                <div className="w-24 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${trustColor(trustScore)}`}
                    style={{ width: `${trustScore}%` }}
                  />
                </div>
                <span className="text-sm font-bold">{trustScore}</span>
              </div>
            </div>

            {/* Timer */}
            <div className={`text-center ${timeLeft < 60 ? 'text-red-600' : 'text-gray-800'}`}>
              <p className="text-xs text-gray-500">Қалған уақыт</p>
              <p className="text-2xl font-mono font-bold">{formatTime(timeLeft)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question navigator */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Сұрақтар</h3>
            <div className="grid grid-cols-4 gap-1">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentQ(i)}
                  className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                    i === currentQ
                      ? 'bg-primary-600 text-white'
                      : answers[q.id]
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            {/* Hidden camera */}
            <video ref={videoRef} autoPlay muted className="hidden" />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Current question */}
          <div className="lg:col-span-3 card">
            <p className="text-sm text-gray-500 mb-2">
              Сұрақ {currentQ + 1} / {questions.length}
            </p>
            {/* Question text — may contain code block */}
            <div className="mb-6">
              {question.text.includes('\n') || question.text.includes('```') ? (
                <div>
                  {question.text.split('```').map((part, i) =>
                    i % 2 === 0 ? (
                      <p key={i} className="text-xl font-semibold text-gray-900 whitespace-pre-line">{part}</p>
                    ) : (
                      <pre key={i} className="bg-gray-900 text-green-300 rounded-lg p-3 my-2 text-sm overflow-x-auto font-mono">{part.replace(/^[a-z]*\n/, '')}</pre>
                    )
                  )}
                </div>
              ) : (
                <h2 className="text-xl font-semibold text-gray-900">{question.text}</h2>
              )}
            </div>

            {question.type === 'SINGLE_CHOICE' && question.options && (
              <div className="space-y-3">
                {question.options.map((opt, idx) => {
                  const isCode = opt.includes('\n') || opt.startsWith('<') || opt.startsWith('const ') || opt.startsWith('function ') || opt.startsWith('class ') || opt.startsWith('SELECT ') || opt.startsWith('INSERT ') || opt.startsWith('def ') || opt.startsWith('FROM ') || opt.startsWith('docker ') || opt.startsWith('git ') || opt.startsWith('npm ') || opt.startsWith('app.') || opt.startsWith('@') || opt.startsWith('services:');
                  return (
                    <label
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        answers[question.id] === opt
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        value={opt}
                        checked={answers[question.id] === opt}
                        onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: opt }))}
                        className="text-primary-600 mt-1 flex-shrink-0"
                      />
                      {isCode ? (
                        <pre className="text-sm font-mono bg-gray-900 text-green-300 rounded px-3 py-2 overflow-x-auto w-full">{opt}</pre>
                      ) : (
                        <span className="text-gray-800">{opt}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {question.type === 'MULTIPLE_CHOICE' && question.options && (
              <div className="space-y-3">
                {question.options.map((opt, idx) => {
                  const selected = (answers[question.id] || '').split(',').includes(opt);
                  return (
                    <label
                      key={idx}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selected
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={opt}
                        checked={selected}
                        onChange={(e) => {
                          const current = (answers[question.id] || '').split(',').filter(Boolean);
                          const updated = e.target.checked
                            ? [...current, opt]
                            : current.filter((v) => v !== opt);
                          setAnswers((prev) => ({ ...prev, [question.id]: updated.join(',') }));
                        }}
                        className="text-primary-600"
                      />
                      <span className="text-gray-800">{opt}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {question.type === 'TEXT' && (
              <textarea
                className="input min-h-[120px] resize-none"
                placeholder="Жауабыңызды теріңіз..."
                value={answers[question.id] || ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                }
              />
            )}

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setCurrentQ((prev) => Math.max(0, prev - 1))}
                disabled={currentQ === 0}
                className="btn-secondary"
              >
                ← Алдыңғы
              </button>

              {currentQ < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQ((prev) => prev + 1)}
                  className="btn-primary"
                >
                  Келесі →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
                >
                  {submitting ? 'Жіберілуде...' : '✓ Аяқтау'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
