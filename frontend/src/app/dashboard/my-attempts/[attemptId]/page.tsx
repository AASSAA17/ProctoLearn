'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Answer {
  id: string;
  answer: string;
  isCorrect: boolean | null;
  question: {
    id: string;
    text: string;
    type: string;
    options: string[] | null;
    answer: string;
  };
}

interface Attempt {
  id: string;
  score: number | null;
  trustScore: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  exam: {
    id: string;
    title: string;
    passScore: number;
    duration: number;
  };
  answers: Answer[];
  events: { id: string; type: string; timestamp: string }[];
}

const EVENT_LABELS: Record<string, string> = {
  TAB_SWITCH:       '🔀 Қойынды ауыстыру',
  FULLSCREEN_EXIT:  '🖥 Толық экраннан шығу',
  FACE_NOT_FOUND:   '👤 Бет анықталмады',
  MULTIPLE_FACES:   '👥 Бірнеше бет анықталды',
  COPY_PASTE:       '📋 Көшіру/қою',
  WINDOW_BLUR:      '🪟 Терезеден шығу',
};

export default function AttemptReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/attempts/${attemptId}`)
      .then(({ data }) => setAttempt(data))
      .catch(() => {
        toast.error('Жүктеу қатесі');
        router.push('/dashboard/my-attempts');
      })
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!attempt) return null;

  const passed = (attempt.score ?? 0) >= attempt.exam.passScore;
  const correctCount = attempt.answers.filter((a) => a.isCorrect).length;
  const duration = attempt.finishedAt
    ? Math.round((new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime()) / 60000)
    : null;

  const trustColor =
    attempt.trustScore >= 80 ? 'text-green-600' :
    attempt.trustScore >= 50 ? 'text-yellow-600' : 'text-red-600';

  const trustBarColor =
    attempt.trustScore >= 80 ? 'bg-green-500' :
    attempt.trustScore >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/dashboard/my-attempts" className="text-primary-600 hover:underline text-sm inline-flex items-center gap-1">
          ← Нәтижелерге оралу
        </Link>
      </div>

      {/* Summary card */}
      <div className={`card mb-6 border-2 ${passed ? 'border-green-400' : 'border-red-400'}`}>
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {passed ? '✅ Өтті' : '❌ Өтпеді'}
              </span>
              {attempt.status === 'FLAGGED' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                  🚩 Күмәнді
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{attempt.exam.title}</h1>
            <p className="text-gray-400 text-sm mt-1">
              📅 {new Date(attempt.startedAt).toLocaleString('kk-KZ')}
              {duration !== null && <span className="ml-3">⏱ {duration} мин</span>}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-4xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
              {attempt.score ?? 0}%
            </p>
            <p className="text-sm text-gray-400 mt-0.5">өту шегі: {attempt.exam.passScore}%</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">{correctCount}/{attempt.answers.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Дұрыс жауаптар</p>
          </div>
          <div className="text-center">
            <p className={`text-xl font-bold ${trustColor}`}>{attempt.trustScore}%</p>
            <p className="text-xs text-gray-500 mt-0.5">Сенімділік</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-orange-600">{attempt.events.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Іс-шаралар</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-gray-700">{duration !== null ? `${duration} мин` : '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Уақыт</p>
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Сенімділік деңгейі</span>
            <span className={`font-semibold ${trustColor}`}>{attempt.trustScore}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${trustBarColor} rounded-full transition-all`}
              style={{ width: `${attempt.trustScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Answers section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          📝 Сұрақтар мен жауаптар
        </h2>
        {attempt.answers.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p>Жауаптар жоқ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attempt.answers.map((ans, idx) => {
              const borderColor =
                ans.isCorrect === true ? 'border-l-green-500' :
                ans.isCorrect === false ? 'border-l-red-500' : 'border-l-gray-300';
              return (
                <div key={ans.id} className={`card border-l-4 ${borderColor}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 mb-3">
                        <span className="text-primary-600 mr-2 font-bold">{idx + 1}.</span>
                        {ans.question.text}
                      </p>

                      {/* Options for choice questions */}
                      {ans.question.options && ans.question.options.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {ans.question.options.map((opt, optIdx) => {
                            const isUserAnswer = ans.answer.split(',').map((s) => s.trim()).includes(opt);
                            const isCorrectAnswer = ans.question.answer.split(',').map((s) => s.trim()).includes(opt);
                            return (
                              <div
                                key={optIdx}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                                  isCorrectAnswer
                                    ? 'bg-green-50 border border-green-200 text-green-800'
                                    : isUserAnswer
                                    ? 'bg-red-50 border border-red-200 text-red-800'
                                    : 'bg-gray-50 text-gray-600'
                                }`}
                              >
                                <span className="text-base">
                                  {isCorrectAnswer ? '✓' : isUserAnswer ? '✗' : '○'}
                                </span>
                                <span className="flex-1">{opt}</span>
                                {isUserAnswer && !isCorrectAnswer && (
                                  <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Сіздің жауап</span>
                                )}
                                {isCorrectAnswer && (
                                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">Дұрыс жауап</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Text answers */}
                      {ans.question.type === 'TEXT' && (
                        <div className="space-y-1.5 text-sm">
                          <div className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">
                            <span className="text-gray-400 text-xs block mb-0.5">Сіздің жауап:</span>
                            <span className="font-medium">{ans.answer || '(жауап жоқ)'}</span>
                          </div>
                          <div className="bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                            <span className="text-gray-400 text-xs block mb-0.5">Дұрыс жауап:</span>
                            <span className="text-green-700 font-medium">{ans.question.answer}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`flex-shrink-0 text-sm font-bold px-2 py-1 rounded ${
                      ans.isCorrect === true ? 'bg-green-100 text-green-700' :
                      ans.isCorrect === false ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {ans.isCorrect === true ? '+1' : ans.isCorrect === false ? '0' : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Proctor events */}
      {attempt.events.length > 0 && (
        <div className="card border border-orange-200 bg-orange-50">
          <h2 className="text-lg font-semibold mb-4 text-orange-700 flex items-center gap-2">
            🚨 Проктеринг іс-шаралары
            <span className="text-sm font-normal bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
              {attempt.events.length}
            </span>
          </h2>
          <div className="space-y-2">
            {attempt.events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 text-sm py-2 px-3 bg-white rounded-lg border border-orange-100">
                <span className="flex-1 text-gray-700">
                  {EVENT_LABELS[ev.type] ?? `⚠ ${ev.type}`}
                </span>
                <span className="text-gray-400 text-xs font-mono">
                  {new Date(ev.timestamp).toLocaleTimeString('kk-KZ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
