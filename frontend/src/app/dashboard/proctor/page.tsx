'use client';

import { useEffect, useState } from 'react';
import api, { WS_URL } from '@/lib/api';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import LoadFailure from '@/components/LoadFailure';

interface AttemptSummary {
  id: string;
  status: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  appealState?: 'OPEN' | 'UPHELD' | 'OVERTURNED' | null;
  flaggedAt?: string | null;
  trustScore: number;
  startedAt: string;
  user: { name: string; email: string } | null;
  exam: { title: string } | null;
  _count: { events: number; evidences: number } | null;
}

export default function ProctorDashboardPage() {
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [appealsOnly, setAppealsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSelected(null);
    setEvents([]);
    api
      .get('/attempts', { signal: controller.signal, params: { page, limit: 50, ...(appealsOnly ? { appealState: 'OPEN' } : {}) } })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        setAttempts(list);
        setLoadError(false);
        const pages = Math.max(1, data?.meta?.totalPages ?? 1);
        setTotalPages(pages);
        if (page > pages) setPage(pages);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appealsOnly, page, refreshVersion]);

  useEffect(() => {
    if (!selected) return;

    const socket = io(`${WS_URL}/proctor`, {
      withCredentials: true,
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('proctor:start', { attemptId: selected, role: 'proctor' });
    });

    socket.on('proctor:event:recorded', ({ event, trustScore, flaggedAt }) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
      setAttempts((prev) =>
        prev.map((a) => (a.id === selected ? { ...a, trustScore, flaggedAt: flaggedAt ?? a.flaggedAt } : a)),
      );
    });

    socket.on('proctor:screenshot:saved', () => {
      toast.success('Жаңа скриншот сақталды', { duration: 2000 });
    });

    let active = true;
    socket.on('proctor:error', async ({ code, message }) => {
      if (code === 'UNAUTHORIZED') {
        try {
          await api.get('/auth/me');
          if (!active) return;
          socket.disconnect().connect();
        } catch { if (active) toast.error(message); }
      } else { toast.error(message); }
    });
    socket.on('exception', ({ message }) => toast.error(message || 'Прокторинг қатесі'));

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setEvents([]);
    api
      .get(`/proctor/sessions/${selected}`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setEvents((data?.events ?? []).reverse());
        setAttempts((previous) => previous.map((attempt) => attempt.id === selected ? { ...attempt, ...data } : attempt));
      })
      .catch(() => { if (!controller.signal.aborted) { setEvents([]); toast.error('Сессияны жүктеу мүмкін болмады'); } });
    return () => controller.abort();
  }, [selected]);

  const handleFlag = async (attemptId: string) => {
    try {
      const { data } = await api.patch(`/attempts/${attemptId}/flag`);
      setAttempts((prev) =>
        prev.map((a) => (a.id === attemptId ? { ...a, ...data } : a)),
      );
      toast.success('Талпыныс белгіленді');
    } catch {
      toast.error('Қате болды');
    }
  };

  const trustColor = (score: number) => {
    if (score >= 80) return 'text-green-700';
    if (score >= 50) return 'text-yellow-700';
    return 'text-red-600';
  };

  const statusBadge = (s: string) => {
    const base = 'text-xs font-semibold px-2 py-0.5 rounded-full';
    if (s === 'FINISHED') return <span className={`${base} bg-green-100 text-green-700`}>Аяқталды</span>;
    if (s === 'IN_PROGRESS') return <span className={`${base} bg-yellow-100 text-yellow-700`}>Жүргізілуде</span>;
    if (s === 'FAILED') return <span className={`${base} bg-red-100 text-red-700`}>Сәтсіз ✗</span>;
    if (s === 'FLAGGED') return <span className={`${base} bg-red-100 text-red-700`}>Белгіленді 🚩</span>;
    return <span className={`${base} bg-gray-100 text-gray-700`}>{s}</span>;
  };

  const eventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      tab_switch: '⚠️ Қойынды ауыстыру',
      copy_paste: '⚠️ Көшіру/қою',
      paste: '⚠️ Қою',
      fullscreen_exit: '⚠️ Толық экраннан шығу',
      face_not_detected: '🚫 Бет анықталмады',
    };
    return labels[type] ?? type;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Проктор панелі</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attempts list */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Қолжетімді талпынулар</h2>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={appealsOnly} onChange={(event) => { setAppealsOnly(event.target.checked); setPage(1); }} />Ашық апелляциялар</label>
              <button type="button" onClick={() => setRefreshVersion((value) => value + 1)} className="text-primary-700 underline">Жаңарту</button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : loadError ? (
              <LoadFailure onRetry={() => setRefreshVersion((value) => value + 1)} />
            ) : attempts.length === 0 ? (
              <p className="text-gray-600 text-center py-8">Талпыныс жоқ</p>
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
                        <p className="font-medium text-gray-900">{attempt.user?.name ?? '—'}</p>
                        <p className="text-sm text-gray-500">{attempt.user?.email ?? '—'}</p>
                        <p className="text-sm text-gray-600">{attempt.exam?.title ?? '—'}</p>
                      </div>
                      <div className="text-right">
                        <button type="button" aria-label={`${attempt.user?.name ?? 'Талпыныс'}: оқиғаларды көру`} aria-pressed={selected === attempt.id} onClick={(event) => { event.stopPropagation(); setSelected(attempt.id); }} className="text-primary-700 underline text-sm mb-1">Оқиғаларды көру</button>
                        {statusBadge(attempt.status)}
                        {attempt.appealState === 'OPEN' && <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Апелляция · тәуелсіз тексеру қажет</p>}
                        {attempt.appealState && attempt.appealState !== 'OPEN' && <p className="mt-1 text-xs text-gray-600">{attempt.appealState === 'OVERTURNED' ? 'Апелляция қанағаттандырылды' : 'Апелляция: шешім сақталды'}</p>}
                        <p className="mt-1 text-xs font-medium text-gray-600">
                          {attempt.reviewStatus === 'APPROVED' ? 'Тексеру: мақұлданды' : attempt.reviewStatus === 'REJECTED' ? 'Тексеру: қабылданбады' : 'Тексеру: күтілуде'}
                          {attempt.flaggedAt ? ' · 🚩 Белгіленген' : ''}
                        </p>
                        <p className={`text-sm font-bold mt-1 ${trustColor(attempt.trustScore ?? 100)}`}>
                          Сенімділік: {attempt.trustScore ?? 100}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                      <span>
                        {attempt._count?.events ?? 0} оқиға · {attempt._count?.evidences ?? 0} жазба
                      </span>
                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/proctor/evidence/${attempt.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary-600 hover:underline"
                        >
                          {attempt.appealState === 'OPEN' ? 'Апелляция және дәлелдемелер' : 'Дәлелдемелер және тексеру'}
                        </Link>
                        {!attempt.flaggedAt && attempt.reviewStatus === 'PENDING' && (
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
                          (attempt.trustScore ?? 100) >= 80
                            ? 'bg-green-500'
                            : (attempt.trustScore ?? 100) >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${attempt.trustScore ?? 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {totalPages > 1 && <div className="flex items-center justify-between pt-3 text-sm">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="text-primary-700 disabled:opacity-40">← Алдыңғы</button>
                  <span>{page} / {totalPages}</span>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="text-primary-700 disabled:opacity-40">Келесі →</button>
                </div>}
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
                <p className="text-gray-600 text-sm">Оқиға жоқ</p>
              ) : (
                events.map((ev, idx) => (
                  <div key={ev?.id ?? idx} className="p-2 bg-yellow-50 rounded text-sm border border-yellow-200">
                    <p className="font-medium">{eventTypeLabel(ev?.type ?? '')}</p>
                    <p className="text-xs text-gray-600">
                      {ev?.timestamp ? new Date(ev.timestamp).toLocaleTimeString('kk-KZ') : '—'}
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
