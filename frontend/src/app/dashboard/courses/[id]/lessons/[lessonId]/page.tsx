'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Lesson {
  id: string;
  title: string;
  content: string;
  videoUrl?: string | null;
  assignment?: string | null;
  hasAssignment?: boolean;
  order: number;
  courseId: string;
  completed?: boolean;
}

interface LessonNav {
  id: string;
  title: string;
  order: number;
  completed?: boolean;
}

export default function LessonViewerPage() {
  const { id: courseId, lessonId } = useParams<{ id: string; lessonId: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessons, setLessons] = useState<LessonNav[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment state
  const [userAnswer, setUserAnswer] = useState('');
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; feedback: string } | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const [lessonRes, progressRes] = await Promise.all([
        api.get(`/courses/${courseId}/lessons/${lessonId}`),
        api.get(`/courses/${courseId}/lessons/progress/my`),
      ]);
      setLesson(lessonRes.data);
      const progress: LessonNav[] = progressRes.data;
      setLessons(progress);
      const cur = progress.find((l) => l.id === lessonId);
      setIsCompleted(!!cur?.completed);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        toast.error('Алдыңғы сабақтарды аяқтаңыз');
      } else {
        toast.error('Сабақ жүктеу қатесі');
      }
      router.push(`/dashboard/courses/${courseId}`);
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    load();
    // Reset assignment state when lesson changes
    setUserAnswer('');
    setAnswerResult(null);
    setRetryCountdown(0);
  }, [load]);

  // Countdown timer effect
  useEffect(() => {
    if (retryCountdown <= 0) return;
    countdownRef.current = setTimeout(() => setRetryCountdown((v) => v - 1), 1000);
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [retryCountdown]);

  const handleCheckAssignment = async () => {
    if (!userAnswer.trim()) return;
    setCheckingAnswer(true);
    setAnswerResult(null);
    try {
      const res = await api.post(`/courses/${courseId}/lessons/${lessonId}/check-assignment`, {
        answer: userAnswer.trim(),
      });
      const result = res.data as { correct: boolean; feedback: string };
      setAnswerResult(result);
      if (result.correct) {
        setIsCompleted(true);
        toast.success('Дұрыс! Сабақ аяқталды! 🎉');
        // Refresh progress list
        const progressRes = await api.get(`/courses/${courseId}/lessons/progress/my`);
        setLessons(progressRes.data);
      } else {
        // Start 15-second retry countdown
        setRetryCountdown(15);
      }
    } catch {
      toast.error('Жауапты тексеру қатесі');
    } finally {
      setCheckingAnswer(false);
    }
  };

  const handleMarkComplete = async () => {
    setMarkingComplete(true);
    try {
      await api.post(`/courses/${courseId}/lessons/${lessonId}/complete`);
      setIsCompleted(true);
      toast.success('Сабақ аяқталды! ✅');
      const progressRes = await api.get(`/courses/${courseId}/lessons/progress/my`);
      setLessons(progressRes.data);
    } catch {
      toast.error('Қате орын алды');
    } finally {
      setMarkingComplete(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!lesson) return null;

  const currentIndex = lessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;
  const completedCount = lessons.filter((l) => l.completed).length;
  const canGoNext = isCompleted && nextLesson;

  const isLessonAccessible = (l: LessonNav) => {
    if (l.order === 1) return true;
    if (l.completed) return true;
    if (l.id === lessonId) return true;
    const prev = lessons.find((p) => p.order === l.order - 1);
    return prev ? (prev.completed || prev.id === lessonId) : false;
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/courses" className="hover:text-primary-600">Курстар</Link>
        <span>/</span>
        <Link href={`/dashboard/courses/${courseId}`} className="hover:text-primary-600">Курсқа оралу</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{lesson.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: lessons list */}
        <div className="card lg:col-span-1 h-fit">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">Сабақтар тізімі</h3>
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Прогресс</span>
              <span>{completedCount}/{lessons.length}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all"
                style={{ width: `${lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <ul className="space-y-1">
            {lessons.map((l) => {
              const accessible = isLessonAccessible(l);
              const isCurrent = l.id === lessonId;
              if (!accessible) {
                return (
                  <li key={l.id}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 cursor-not-allowed opacity-50">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-200 bg-gray-100 flex items-center justify-center text-xs">🔒</span>
                      <span className="truncate">{l.title}</span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={l.id}>
                  <Link
                    href={`/dashboard/courses/${courseId}/lessons/${l.id}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isCurrent
                        ? 'bg-primary-600 text-white font-medium'
                        : l.completed
                        ? 'text-green-700 hover:bg-green-50'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${
                      l.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : isCurrent
                        ? 'border-white'
                        : 'border-gray-300'
                    }`}>
                      {l.completed ? '✓' : l.order}
                    </span>
                    <span className="truncate">{l.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Main content */}
        <div className="lg:col-span-3">
          <div className="card mb-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold px-3 py-1 rounded-full">
                {lesson.order}-сабақ
              </span>
              {isCompleted && (
                <span className="bg-green-100 text-green-700 text-sm px-3 py-1 rounded-full">
                  ✓ Аяқталды
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">{lesson.title}</h1>

            {/* YouTube video block */}
            {lesson.videoUrl && (
              <div className="mb-6">
                {lesson.videoUrl.includes('/embed/') ? (
                  <div className="relative w-full rounded-xl overflow-hidden shadow-lg" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      src={lesson.videoUrl}
                      title={lesson.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                ) : (
                  <a
                    href={lesson.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl px-5 py-4 transition-colors group"
                  >
                    <span className="text-3xl">▶</span>
                    <div>
                      <p className="font-semibold text-red-700 group-hover:text-red-800">YouTube-та видео қарау</p>
                      <p className="text-sm text-red-500">Жаңа қойындыда ашылады</p>
                    </div>
                    <span className="ml-auto text-red-400">→</span>
                  </a>
                )}
              </div>
            )}

            {/* Lesson content */}
            <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap mb-8">
              {lesson.content}
            </div>

            {/* ─────────── ASSIGNMENT BLOCK ─────────── */}
            {lesson.assignment && (
              <div className="mt-2">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">✏️</span>
                    <h3 className="font-bold text-amber-800 text-base">Тапсырма</h3>
                  </div>
                  <p className="text-amber-900 leading-relaxed whitespace-pre-wrap">{lesson.assignment}</p>
                </div>

                {/* If not yet completed — show submission form */}
                {!isCompleted ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Жауабыңызды жазыңыз:
                    </label>
                    <textarea
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      disabled={retryCountdown > 0 || checkingAnswer}
                      placeholder="Жауапты осында жазыңыз..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
                    />

                    {/* Result feedback */}
                    {answerResult && !answerResult.correct && (
                      <div className="mt-3 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                        <span className="text-xl flex-shrink-0">❌</span>
                        <div>
                          <p className="text-red-700 font-semibold text-sm">{answerResult.feedback}</p>
                          {retryCountdown > 0 && (
                            <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                              <span className="inline-block w-5 h-5 rounded-full border-2 border-red-400 border-t-transparent animate-spin"></span>
                              Қайталауға: <strong>{retryCountdown}</strong> секунд
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleCheckAssignment}
                      disabled={!userAnswer.trim() || checkingAnswer || retryCountdown > 0}
                      className="mt-4 w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {checkingAnswer ? (
                        <>
                          <span className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                          Тексерілуде...
                        </>
                      ) : retryCountdown > 0 ? (
                        `⏳ ${retryCountdown} секундтан кейін қайталаңыз`
                      ) : (
                        '✅ Жауапты тексеру'
                      )}
                    </button>
                  </div>
                ) : (
                  /* Already completed */
                  <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
                    <span className="text-3xl">🎉</span>
                    <div>
                      <p className="font-bold text-green-800">Тапсырма орындалды!</p>
                      <p className="text-green-600 text-sm">Сабақ сәтті аяқталды. Келесі сабаққа өте аласыз.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── Mark complete button for reading-only lessons ─── */}
            {!lesson.assignment && !isCompleted && (
              <div className="mt-6 border-t border-gray-100 pt-6">
                <button
                  onClick={handleMarkComplete}
                  disabled={markingComplete}
                  className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {markingComplete ? (
                    <>
                      <span className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                      Жазылуда...
                    </>
                  ) : (
                    '📖 Оқып шықтым — Аяқтау'
                  )}
                </button>
              </div>
            )}

            {/* ─── Already completed (no assignment) ─── */}
            {!lesson.assignment && isCompleted && (
              <div className="mt-6 border-t border-gray-100 pt-6">
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2 text-green-700">
                  <span>✅</span>
                  <span className="text-sm font-medium">Сабақ аяқталды</span>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            {prevLesson ? (
              <Link
                href={`/dashboard/courses/${courseId}/lessons/${prevLesson.id}`}
                className="btn-secondary flex items-center gap-2"
              >
                ← {prevLesson.title}
              </Link>
            ) : (
              <Link href={`/dashboard/courses/${courseId}`} className="btn-secondary">
                ← Курсқа оралу
              </Link>
            )}

            {canGoNext ? (
              <Link
                href={`/dashboard/courses/${courseId}/lessons/${nextLesson.id}`}
                className="btn-primary flex items-center gap-2"
              >
                {nextLesson.title} →
              </Link>
            ) : nextLesson ? (
              <button
                disabled
                title="Тапсырманы орындаңыз"
                className="btn-primary opacity-40 cursor-not-allowed flex items-center gap-2"
              >
                🔒 {nextLesson.title}
              </button>
            ) : (
              <Link href={`/dashboard/courses/${courseId}`} className="btn-primary">
                Курсқа оралу →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
