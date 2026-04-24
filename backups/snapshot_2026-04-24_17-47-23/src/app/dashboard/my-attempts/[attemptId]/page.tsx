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
        toast.error('Жуктеу катесі');
        router.push('/dashboard/my-attempts');
      })
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!attempt) return null;

  const passed = (attempt.score ?? 0) >= attempt.exam.passScore;
  const correctCount = attempt.answers.filter((a) => a.isCorrect).length;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard/my-attempts" className="text-primary-600 hover:underline text-sm">
          ← Natijelerge oralyу
        </Link>
      </div>

      {/* Summary card */}
      <div className={`card mb-6 border-2 ${passed ? 'border-green-400' : 'border-red-400'}`}>
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{attempt.exam.title}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {attempt.startedAt ? new Date(attempt.startedAt).toLocaleString('kk-KZ') : ''}
            </p>
          </div>
          <div className={`text-3xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
            {attempt.score ?? 0}%
            <p className="text-sm font-normal text-gray-500">Otu: {attempt.exam.passScore}%</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 mt-4 text-sm">
          <div>
            <span className="text-gray-500">Natije: </span>
            {passed ? (
              <span className="text-green-600 font-semibold">Otti</span>
            ) : (
              <span className="text-red-600 font-semibold">Otpedi</span>
            )}
          </div>
          <div>
            <span className="text-gray-500">Durys zhauaptar: </span>
            <span className="font-semibold">{correctCount}/{attempt.answers.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Trust Score: </span>
            <span className={`font-semibold ${attempt.trustScore >= 80 ? 'text-green-600' : attempt.trustScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {attempt.trustScore}/100
            </span>
          </div>
          {attempt.events.length > 0 && (
            <div>
              <span className="text-gray-500">Is-sharalar: </span>
              <span className="font-semibold text-orange-600">{attempt.events.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Answers */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Surаktar men zhauaptar</h2>
        {attempt.answers.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Zhauap zhok</p>
        ) : (
          attempt.answers.map((ans, idx) => (
            <div
              key={ans.id}
              className={`card border-l-4 ${
                ans.isCorrect === true
                  ? 'border-l-green-500'
                  : ans.isCorrect === false
                  ? 'border-l-red-500'
                  : 'border-l-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 mb-2">
                    <span className="text-primary-600 mr-2">{idx + 1}.</span>
                    {ans.question.text}
                  </p>

                  {/* Options for choice questions */}
                  {ans.question.options && ans.question.options.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {ans.question.options.map((opt, optIdx) => {
                        const isUserAnswer = ans.answer.split(',').map((s) => s.trim()).includes(opt);
                        const isCorrectAnswer = ans.question.answer.split(',').map((s) => s.trim()).includes(opt);
                        return (
                          <div
                            key={optIdx}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${
                              isCorrectAnswer
                                ? 'bg-green-100 text-green-800'
                                : isUserAnswer
                                ? 'bg-red-100 text-red-800'
                                : 'text-gray-600'
                            }`}
                          >
                            <span>{isCorrectAnswer ? '✓' : isUserAnswer ? '✗' : '○'}</span>
                            <span>{opt}</span>
                            {isUserAnswer && !isCorrectAnswer && <span className="ml-auto text-xs">Sizdin zhauap</span>}
                            {isCorrectAnswer && <span className="ml-auto text-xs font-medium">Durys zhaup</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Text answers */}
                  {ans.question.type === 'TEXT' && (
                    <div className="space-y-1 text-sm">
                      <div className="bg-gray-50 px-3 py-2 rounded">
                        <span className="text-gray-500 mr-2">Sizdin zhaup:</span>
                        <span className="font-medium">{ans.answer || '(zhaup zhoк)'}</span>
                      </div>
                      <div className="bg-green-50 px-3 py-2 rounded">
                        <span className="text-gray-500 mr-2">Durys zhaup:</span>
                        <span className="text-green-700 font-medium">{ans.question.answer}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`flex-shrink-0 text-sm font-semibold ${ans.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                  {ans.isCorrect === true ? '+1' : ans.isCorrect === false ? '0' : '—'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Proctor events */}
      {attempt.events.length > 0 && (
        <div className="card mt-6">
          <h2 className="text-lg font-semibold mb-4 text-orange-700">Proktering is-sharalary</h2>
          <div className="space-y-2">
            {attempt.events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 text-sm py-1 border-b border-gray-100 last:border-0">
                <span className="text-orange-500">⚠</span>
                <span className="font-mono text-gray-700">{ev.type}</span>
                <span className="ml-auto text-gray-400 text-xs">
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
