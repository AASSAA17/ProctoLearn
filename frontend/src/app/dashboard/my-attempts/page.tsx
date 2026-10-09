'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import LoadFailure from '@/components/LoadFailure';

interface Attempt {
  id: string;
  status: string;
  score: number | null;
  trustScore: number;
  startedAt: string;
  finishedAt: string | null;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  appealState?: 'OPEN' | 'UPHELD' | 'OVERTURNED' | null;
  reviewReason?: string | null;
  flaggedAt?: string | null;
  exam: { id: string; title: string; passScore: number };
}

export default function MyAttemptsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    api
      .get('/attempts/my')
      .then(({ data }) => { setAttempts(data); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [retryKey]);

  const retry = () => { setLoading(true); setRetryKey((key) => key + 1); };

  const statusLabel = (attempt: Attempt) => {
    const s = attempt.status;
    if (attempt.finishedAt && attempt.reviewStatus === 'PENDING') return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Тексеруді күтуде</span>;
    if (attempt.reviewStatus === 'REJECTED') return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Тексеру қабылдамады</span>;
    if (s === 'FINISHED')    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">✅ Сдан</span>;
    if (s === 'IN_PROGRESS') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">⏳ Жүргізілуде</span>;
    if (s === 'FAILED')      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">❌ Сдан емес</span>;
    if (s === 'FLAGGED')     return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">🚩 Күмәнді</span>;
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{s}</span>;
  };

  const trustBar = (score: number) => {
    const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
    const textColor = score >= 80 ? 'text-green-700' : score >= 50 ? 'text-yellow-700' : 'text-red-700';
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-xs font-semibold ${textColor}`}>{score}%</span>
      </div>
    );
  };

  const getDuration = (start: string, end: string | null) => {
    if (!end) return '—';
    const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
    return `${diff} мин`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  if (loadError) return <LoadFailure onRetry={retry} />;

  // Stats
  const finished = attempts.filter(a => a.status === 'FINISHED' && a.reviewStatus === 'APPROVED');
  const pending = attempts.filter(a => a.finishedAt && a.reviewStatus === 'PENDING');
  const avgScore = finished.length > 0
    ? Math.round(finished.reduce((s, a) => s + (a.score ?? 0), 0) / finished.length)
    : null;

  return (
    <div className="max-w-4xl">
      <div className="workspace-page-header"><div><p className="workspace-eyebrow">Оқу нәтижелері</p><h1 className="font-bold text-gray-900">Менің нәтижелерім</h1><p className="mt-3 text-sm text-slate-500">Емтихандарыңыздың нәтижелері мен тексеру күйі.</p></div></div>

      {attempts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-lg font-medium mb-2">Талпыныс табылмады</p>
          <p className="text-sm text-gray-600 mb-6">Емтихан тапсырғаннан кейін нәтижелер осында көрінеді</p>
          <Link href="/dashboard/courses" className="btn-primary">
            Курстарды қарау →
          </Link>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center py-4">
              <p className="text-3xl font-bold text-primary-600">{attempts.length}</p>
              <p className="text-xs text-gray-500 mt-1">Барлық талпыныс</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-3xl font-bold text-green-700">{finished.length}</p>
              <p className="text-xs text-gray-500 mt-1">Расталған нәтиже</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-3xl font-bold text-amber-600">{pending.length}</p>
              <p className="text-xs text-gray-500 mt-1">Тексеруді күтуде</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-3xl font-bold text-blue-600">{avgScore !== null ? `${avgScore}%` : '—'}</p>
              <p className="text-xs text-gray-500 mt-1">Орт. балл</p>
            </div>
          </div>

          {/* Attempts list */}
          <div className="space-y-3">
            {attempts.map((attempt) => {
              const passed = attempt.score !== null && attempt.score >= attempt.exam.passScore;
              const borderColor =
                attempt.status === 'FINISHED' ? 'border-l-green-400' :
                attempt.status === 'FLAGGED'  ? 'border-l-orange-400' :
                attempt.status === 'FAILED'   ? 'border-l-red-400' :
                'border-l-blue-400';

              return (
                <div key={attempt.id} className={`card border-l-4 ${borderColor}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* Left: exam info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {statusLabel(attempt)}
                        {attempt.appealState && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{attempt.appealState === 'OPEN' ? 'Апелляция қаралуда' : attempt.appealState === 'OVERTURNED' ? 'Апелляция қанағаттандырылды' : 'Апелляция: шешім сақталды'}</span>}
                        {attempt.flaggedAt && <span className="text-xs text-amber-700">Қосымша тексеру</span>}
                        <h3 className="font-semibold text-gray-900 text-sm truncate">
                          {attempt.exam.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        {/* Score */}
                        {attempt.score !== null && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600 text-xs">Балл:</span>
                            <span className={`font-bold text-base ${passed ? 'text-green-700' : 'text-red-700'}`}>
                              {attempt.score}%
                            </span>
                            <span className="text-xs text-gray-600">(өту: {attempt.exam.passScore}%)</span>
                            {passed ? <span className="text-green-700 text-xs">Өту балы жиналды</span> : <span className="text-red-700 text-xs">Өту балы жиналмады</span>}
                          </div>
                        )}
                        {/* Trust */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600 text-xs">Сенімділік:</span>
                          {trustBar(attempt.trustScore)}
                        </div>
                      </div>
                      {attempt.reviewStatus === 'REJECTED' && attempt.reviewReason && <p className="mt-2 text-sm text-red-700">Тексеру себебі: {attempt.reviewReason}</p>}
                      {/* Date + duration */}
                      <div className="flex gap-4 mt-2 text-xs text-gray-600">
                        <span>📅 {new Date(attempt.startedAt).toLocaleDateString('kk-KZ', { day:'numeric', month:'long', year:'numeric' })}</span>
                        <span>⏱ {getDuration(attempt.startedAt, attempt.finishedAt)}</span>
                      </div>
                    </div>

                    {/* Right: action button */}
                    <div className="flex-shrink-0">
                      {attempt.status === 'IN_PROGRESS' && (
                        <Link href={`/dashboard/exam/${attempt.exam.id}`} className="btn-primary text-sm px-4 py-2">
                          ▶ Жалғастыру
                        </Link>
                      )}
                      {(attempt.status === 'FINISHED' || attempt.status === 'FLAGGED' || attempt.status === 'FAILED') && (
                        <Link href={`/dashboard/my-attempts/${attempt.id}`} className="btn-secondary text-sm px-4 py-2">
                          {attempt.appealState ? 'Апелляцияны қарау' : attempt.reviewStatus === 'REJECTED' ? 'Нәтиже және апелляция' : '📄 Нәтижені қарау'}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
