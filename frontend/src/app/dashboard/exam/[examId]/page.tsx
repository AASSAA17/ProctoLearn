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

  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const screenshotRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sendEvent = useCallback((type: string, metadata?: Record<string, any>) => {
    socketRef.current?.emit('proctor:event', {
      attemptId: attempt?.id,
      type,
      metadata,
    });
  }, [attempt?.id]);

  // Setup camera for screenshots
  const setupCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      console.warn('Camera not available');
    }
  };

  const captureScreenshot = useCallback(() => {
    if (!canvasRef.current || !videoRef.current || !attempt) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    socketRef.current?.emit('proctor:screenshot', {
      attemptId: attempt.id,
      image: base64,
    });
  }, [attempt]);

  // Proctoring event listeners
  useEffect(() => {
    if (!attempt) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendEvent('tab_switch', { timestamp: new Date().toISOString() });
        toast.error('Қойынды ауыстыру тіркелді! -10 Trust Score', { duration: 3000 });
      }
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
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Try to enter fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {});

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

        // Screenshot every 30 seconds
        screenshotRef.current = setInterval(captureScreenshot, 30000);
      } catch (err: any) {
        toast.error('Емтиханды бастау қатесі');
        router.push('/dashboard/courses');
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      clearInterval(screenshotRef.current);
      clearInterval(timerRef.current);
      socketRef.current?.disconnect();
      // Stop camera
      const video = videoRef.current;
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
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

      if (data.passed) {
        toast.success(`Сіз өттіңіз! Балл: ${data.score}% 🎉`);
      } else {
        toast.error(`Өтпедіңіз. Балл: ${data.score}%`);
      }

      router.push('/dashboard/my-attempts');
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
            <h2 className="text-xl font-semibold text-gray-900 mb-6">{question.text}</h2>

            {question.type === 'SINGLE_CHOICE' && question.options && (
              <div className="space-y-3">
                {question.options.map((opt, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
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
                      className="text-primary-600"
                    />
                    <span className="text-gray-800">{opt}</span>
                  </label>
                ))}
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
  );
}
