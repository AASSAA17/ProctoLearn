'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Attempt {
  id: string;
  status: string;
  score: number | null;
  trustScore: number;
  startedAt: string;
  finishedAt: string | null;
  exam: { id: string; title: string; passScore: number };
}

export default function MyAttemptsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/attempts/my')
      .then(({ data }) => setAttempts(data))
      .catch(() => toast.error('Жүктеу қатесі'))
      .finally(() => setLoading(false));
  }, []);

  const statusLabel = (s: string) => {
    if (s === 'FINISHED') return <span className="badge-success">Аяқталды</span>;
    if (s === 'IN_PROGRESS') return <span className="badge-warning">Жүргізілуде</span>;
    if (s === 'FAILED') return <span className="badge-danger">Сәтсіз ✗</span>;
    if (s === 'FLAGGED') return <span className="badge-danger">Белгіленді 🚩</span>;
    return <span className="badge-danger">{s}</span>;
  };

  const trustColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Менің нәтижелерім</h1>

      {attempts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-4">Талпыныс табылмады</p>
          <Link href="/dashboard/courses" className="btn-primary">
            Курстарды қарау
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {attempts.map((attempt) => (
            <div key={attempt.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{attempt.exam.title}</h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span>{statusLabel(attempt.status)}</span>
                  {attempt.score !== null && (
                    <span className={attempt.score >= attempt.exam.passScore ? 'text-green-600' : 'text-red-600'}>
                      Балл: {attempt.score}% {attempt.score >= attempt.exam.passScore ? '✓' : '✗'}
                    </span>
                  )}
                  <span className={`font-medium ${trustColor(attempt.trustScore)}`}>
                    Сенімділік: {attempt.trustScore}/100
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(attempt.startedAt).toLocaleDateString('kk-KZ')}
                </p>
              </div>
              <div className="flex gap-2">
                {attempt.status === 'IN_PROGRESS' && (
                  <Link href={`/dashboard/exam/${attempt.exam.id}`} className="btn-primary text-sm">
                    Жалғастыру
                  </Link>
                )}
                {(attempt.status === 'FINISHED' || attempt.status === 'FLAGGED' || attempt.status === 'FAILED') && (
                  <Link href={`/dashboard/my-attempts/${attempt.id}`} className="btn-secondary text-sm">
                    Нәтижені қарау
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
