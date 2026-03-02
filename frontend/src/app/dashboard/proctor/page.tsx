'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface AttemptSummary {
  id: string;
  status: string;
  trustScore: number;
  startedAt: string;
  user: { name: string; email: string };
  exam: { title: string };
  _count: { events: number; evidences: number };
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

export default function ProctorDashboardPage() {
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/attempts')
      .then(({ data }) => setAttempts(data))
      .catch(() => toast.error('Жүктеу қатесі'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;

    const token = localStorage.getItem('accessToken');
    const socket = io(`${WS_URL}/proctor`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('proctor:start', { attemptId: selected, role: 'proctor' });
    });

    socket.on('proctor:event:recorded', ({ event, trustScore }) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
      setAttempts((prev) =>
        prev.map((a) => (a.id === selected ? { ...a, trustScore } : a)),
      );
    });

    socket.on('proctor:screenshot:saved', ({ url }) => {
      toast.success('Жаңа скриншот сақталды', { duration: 2000 });
    });

    return () => {
      socket.disconnect();
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    api
      .get(`/proctor/sessions/${selected}`)
      .then(({ data }) => setEvents(data.events.reverse()))
      .catch(() => {});
  }, [selected]);

  const handleFlag = async (attemptId: string) => {
    await api.patch(`/attempts/${attemptId}/flag`);
    setAttempts((prev) =>
      prev.map((a) => (a.id === attemptId ? { ...a, status: 'FLAGGED' } : a)),
    );
    toast.success('Талпыныс белгіленді');
  };

  const trustColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const statusBadge = (s: string) => {
    if (s === 'FINISHED') return <span className="badge-success">Аяқталды</span>;
    if (s === 'IN_PROGRESS') return <span className="badge-warning">Жүргізілуде</span>;
    return <span className="badge-danger">Белгіленді 🚩</span>;
  };

  const eventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      tab_switch: '⚠️ Қойынды ауыстыру',
      copy_paste: '⚠️ Көшіру/қою',
      paste: '⚠️ Қою',
      fullscreen_exit: '⚠️ Толық экраннан шығу',
      face_not_detected: '🚫 Бет анықталмады',
    };
    return labels[type] || type;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Проктор панелі</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attempts list */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Барлық талпынулар</h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : attempts.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Талпыныс жоқ</p>
            ) : (
              <div className="space-y-3">
                {attempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selected === attempt.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelected(attempt.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{attempt.user.name}</p>
                        <p className="text-sm text-gray-500">{attempt.exam.title}</p>
                      </div>
                      <div className="text-right">
                        {statusBadge(attempt.status)}
                        <p className={`text-sm font-bold mt-1 ${trustColor(attempt.trustScore)}`}>
                          Trust: {attempt.trustScore}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                      <span>{attempt._count.events} оқиға · {attempt._count.evidences} скриншот</span>
                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/proctor/evidence/${attempt.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary-600 hover:underline"
                        >
                          Дәлелдемелер
                        </Link>
                        {attempt.status !== 'FLAGGED' && attempt.status !== 'FINISHED' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleFlag(attempt.id); }}
                            className="text-red-600 hover:underline"
                          >
                            Белгілеу 🚩
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Trust score bar */}
                    <div className="mt-2 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          attempt.trustScore >= 80
                            ? 'bg-green-500'
                            : attempt.trustScore >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${attempt.trustScore}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event feed */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">
            {selected ? 'Нақты уақыт оқиғалары' : 'Талпыныс таңдаңыз'}
          </h2>
          {selected && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-gray-400 text-sm">Оқиға жоқ</p>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="p-2 bg-yellow-50 rounded text-sm border border-yellow-200">
                    <p className="font-medium">{eventTypeLabel(ev.type)}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(ev.timestamp).toLocaleTimeString('kk-KZ')}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
