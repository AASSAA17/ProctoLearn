'use client';

import { useEffect, useState } from 'react';
import api, { WS_URL } from '@/lib/api';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import LoadFailure from '@/components/LoadFailure';
import { mergeProctorEvents, mergeProctorSignals, ProctorFeedEvent } from '@/lib/proctor-feed';

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
  const [events, setEvents] = useState<ProctorFeedEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventsVersion, setEventsVersion] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [appealsOnly, setAppealsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const selectAttempt = (attemptId: string) => {
    if (attemptId === selected) return;
    setEvents([]);
    setEventsError(false);
    setEventsLoading(true);
    setLiveConnected(false);
    setSelected(attemptId);
  };

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
    let active = true;

    socket.on('connect', () => {
      socket.emit('proctor:start', { attemptId: selected, role: 'proctor' });
    });

    socket.on('proctor:started', ({ attemptId }) => {
      if (!active || attemptId !== selected) return;
      setLiveConnected(true);
      // Fetch after joining, including on reconnect, to recover events missed while offline.
      setEventsVersion(value => value + 1);
    });
    socket.on('disconnect', () => { if (active) setLiveConnected(false); });
    socket.on('connect_error', () => { if (active) setLiveConnected(false); });

    socket.on('proctor:event:recorded', ({ event, trustScore, flaggedAt }) => {
      if (!active || event?.attemptId !== selected) return;
      setEvents((prev) => mergeProctorEvents(selected, prev, [event]));
      setAttempts((prev) =>
        prev.map((a) => (a.id === selected ? { ...a, ...mergeProctorSignals(a, { trustScore, flaggedAt }) } : a)),
      );
    });

    socket.on('proctor:screenshot:saved', () => {
      toast.success('Жаңа скриншот сақталды', { duration: 2000 });
    });

    socket.on('proctor:error', async ({ code, message }) => {
      if (!active) return;
      setLiveConnected(false);
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
    setEventsLoading(true);
    setEventsError(false);
    api
      .get(`/proctor/sessions/${selected}`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setEvents((previous) => mergeProctorEvents(selected, data?.events ?? [], previous));
        setAttempts((previous) => previous.map((attempt) => attempt.id === selected ? { ...attempt, ...data, ...mergeProctorSignals(attempt, data) } : attempt));
      })
      .catch(() => { if (!controller.signal.aborted) setEventsError(true); })
      .finally(() => { if (!controller.signal.aborted) setEventsLoading(false); });
    return () => controller.abort();
  }, [selected, eventsVersion]);

  const handleFlag = async (attemptId: string) => {
    try {
      const { data } = await api.patch(`/attempts/${attemptId}/flag`);
      setAttempts((prev) =>
        prev.map((a) => (a.id === attemptId ? { ...a, ...data, ...mergeProctorSignals(a, data) } : a)),
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
                  <article
                    key={attempt.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selected === attempt.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => selectAttempt(attempt.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{attempt.user?.name ?? '—'}</p>
                        <p className="text-sm text-gray-600">{attempt.user?.email ?? '—'}</p>
                        <p className="text-sm text-gray-600">{attempt.exam?.title ?? '—'}</p>
                      </div>
                      <div className="text-right">
                        <button type="button" aria-label={`${attempt.user?.name ?? 'Талпыныс'}: оқиғаларды көру`} aria-pressed={selected === attempt.id} onClick={(event) => { event.stopPropagation(); selectAttempt(attempt.id); }} className="text-primary-700 underline text-sm mb-1">Оқиғаларды көру</button>
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
                            className="text-red-700 hover:underline"
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
                  </article>
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
        <section className="card" aria-labelledby="proctor-events-heading">
          <h2 id="proctor-events-heading" className="text-lg font-semibold mb-4">
            {selected ? 'Нақты уақыт оқиғалары' : 'Талпыныс таңдаңыз'}
          </h2>
          {selected && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              <p role="status" className="text-sm text-gray-600">{liveConnected ? 'Тікелей байланыс қосылды' : 'Тікелей байланыс жоқ. Оқиғаларды жаңартуға болады.'}</p>
              <button type="button" onClick={() => setEventsVersion(value => value + 1)} disabled={eventsLoading} className="text-sm text-primary-700 underline disabled:opacity-50">Оқиғаларды жаңарту</button>
              {eventsLoading && <p role="status" className="text-gray-600 text-sm">Оқиғалар жүктелуде...</p>}
              {eventsError && <LoadFailure onRetry={() => setEventsVersion(value => value + 1)} />}
              {events.length === 0 && !eventsLoading && !eventsError ? (
                <p className="text-gray-600 text-sm">Оқиға жоқ</p>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="p-2 bg-yellow-50 rounded text-sm border border-yellow-200">
                    <p className="font-medium">{eventTypeLabel(ev?.type ?? '')}</p>
                    <p className="text-xs text-gray-600">
                      {ev?.timestamp ? new Date(ev.timestamp).toLocaleTimeString('kk-KZ') : '—'}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
