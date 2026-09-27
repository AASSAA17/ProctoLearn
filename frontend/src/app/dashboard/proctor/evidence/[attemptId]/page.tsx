'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';

interface Evidence {
  id: string;
  type: string;
  url: string;
  createdAt: string;
}

interface ReviewSummary {
  id: string;
  userId: string;
  status: string;
  score: number | null;
  finishedAt: string | null;
  flaggedAt: string | null;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewReason: string | null;
  reviewedAt: string | null;
  exam: { title: string; passScore: number };
}

function EvidenceCard({ ev, revision, onRefresh }: { ev: Evidence; revision: number; onRefresh: () => void }) {
  const isVideo = ev.type?.startsWith('recording_');
  const label = ev.type === 'recording_camera' ? 'Камера' : ev.type === 'recording_screen' ? 'Экран' : 'Файл';
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef({ time: 0, paused: true });
  const restoringRef = useRef<{ time: number; paused: boolean } | null>(null);

  const rememberPlayback = () => {
    const video = videoRef.current;
    if (video && !restoringRef.current && !video.error) {
      playbackRef.current = { time: video.currentTime, paused: video.paused };
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState > 0 && !video.error && !restoringRef.current) {
      playbackRef.current = { time: video.currentTime, paused: video.paused };
    }
    restoringRef.current = { ...playbackRef.current };
    // Change the source only after capturing playback. A React src update would
    // reset currentTime before the effect could capture the previous position.
    video.src = ev.url;
    video.load();
  }, [ev.url, revision]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      video?.pause();
      video?.removeAttribute('src');
      video?.load();
    };
  }, []);

  const restorePlayback = () => {
    const video = videoRef.current;
    const previous = restoringRef.current;
    if (!video || !previous) return;
    video.currentTime = Number.isFinite(video.duration)
      ? Math.min(previous.time, video.duration)
      : previous.time;
    restoringRef.current = null;
    if (!previous.paused) void video.play().catch(() => undefined);
  };

  return (
    <div className="card p-3 flex flex-col">
      <span className="text-xs font-medium text-primary-600 mb-2">{label}</span>
      {isVideo ? (
        <video
          ref={videoRef}
          controls
          preload="metadata"
          onLoadedMetadata={restorePlayback}
          onTimeUpdate={rememberPlayback}
          onPlay={rememberPlayback}
          onPause={rememberPlayback}
          onSeeked={rememberPlayback}
          onError={onRefresh}
          className="w-full rounded bg-gray-900 aspect-video"
        />
      ) : (
        <a href={ev.url} target="_blank" rel="noopener noreferrer">
          <img
            src={ev.url}
            alt="screenshot"
            className="w-full h-40 object-cover rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160"><rect fill="%23e5e7eb" width="200" height="160"/><text fill="%239ca3af" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="14">Скриншот</text></svg>';
            }}
          />
        </a>
      )}
      <p className="text-xs text-gray-400 mt-2 text-center">
        {new Date(ev.createdAt).toLocaleTimeString('kk-KZ')}
      </p>
    </div>
  );
}

export default function EvidencePage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const user = useAuthStore((state) => state.user);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const reviewRequestRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const activeRef = useRef(false);
  const epochRef = useRef(0);
  const deniedRef = useRef(false);
  const lastErrorRefreshRef = useRef(0);
  const pendingRef = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);

  const refresh = useCallback((reason: 'initial' | 'timer' | 'error' | 'manual' = 'manual') => {
    if (!activeRef.current || (deniedRef.current && reason !== 'manual')) return;
    if (reviewRequestRef.current) return;
    if (pendingRef.current) return pendingRef.current.promise;
    // Multiple videos can fail together; retry once and avoid a source-error loop.
    if (reason === 'error') {
      if (Date.now() - lastErrorRefreshRef.current < 10_000) return;
      lastErrorRefreshRef.current = Date.now();
    }
    const epoch = epochRef.current;
    const controller = new AbortController();
    const promise = Promise.all([
      api.get<Evidence[]>(`/evidence/${attemptId}`, { signal: controller.signal }),
      api.get<ReviewSummary>(`/proctor/sessions/${attemptId}`, { signal: controller.signal }),
    ])
      .then(([recordings, session]) => {
        if (controller.signal.aborted || !activeRef.current || epoch !== epochRef.current) return;
        deniedRef.current = false;
        setEvidences(recordings.data);
        setSummary(session.data);
        setRevision((value) => value + 1);
        setError(null);
      })
      .catch((failure) => {
        if (controller.signal.aborted || !activeRef.current || epoch !== epochRef.current) return;
        if ([401, 403, 404].includes(failure?.response?.status)) {
          deniedRef.current = true;
          setEvidences([]);
          setSummary(null);
          setError('Жазбаларды көруге рұқсат жоқ немесе талпыныс табылмады.');
        } else {
          setError('Жазбаларды жаңарту мүмкін болмады. Қайта көріңіз.');
        }
      })
      .finally(() => {
        if (pendingRef.current?.controller === controller) pendingRef.current = null;
        if (activeRef.current && epoch === epochRef.current) setLoading(false);
      });
    pendingRef.current = { controller, promise };
    return promise;
  }, [attemptId]);

  useEffect(() => {
    activeRef.current = true;
    epochRef.current++;
    deniedRef.current = false;
    lastErrorRefreshRef.current = 0;
    setLoading(true);
    setEvidences([]);
    setSummary(null);
    setReviewReason('');
    setReviewError(null);
    setReviewMessage(null);
    setReviewing(false);
    setError(null);
    void refresh('initial');
    // API URLs last five minutes. Refresh before expiry so later range requests
    // (including a seek in a long recording) continue to work.
    const timer = setInterval(() => { void refresh('timer'); }, 4 * 60_000);
    return () => {
      activeRef.current = false;
      epochRef.current++;
      clearInterval(timer);
      pendingRef.current?.controller.abort();
      pendingRef.current = null;
      reviewRequestRef.current?.abort();
      reviewRequestRef.current = null;
    };
  }, [refresh]);

  const refreshOnPlaybackError = useCallback(() => { void refresh('error'); }, [refresh]);

  const cameras = evidences.filter((e) => e.type === 'recording_camera');
  const screens = evidences.filter((e) => e.type === 'recording_screen');
  const other = evidences.filter((e) => !e.type?.startsWith('recording_'));
  const finished = !!summary?.finishedAt && ['FINISHED', 'FAILED'].includes(summary.status);
  const ownAttempt = !!summary && summary.userId === user?.id;
  const pendingReview = summary?.reviewStatus === 'PENDING';
  const canReview = finished && pendingReview && !ownAttempt;
  const canApprove = canReview && summary?.status === 'FINISHED' && summary.score !== null
    && summary.score >= summary.exam.passScore && cameras.length > 0 && screens.length > 0;

  const submitReview = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!canReview || reviewRequestRef.current || (decision === 'APPROVED' && !canApprove)) return;
    const reason = reviewReason.trim();
    if (reason.length < 3 || reason.length > 2000) {
      setReviewError('Шешімнің себебін жазыңыз (3–2000 таңба).');
      return;
    }
    const epoch = epochRef.current;
    const controller = new AbortController();
    pendingRef.current?.controller.abort();
    pendingRef.current = null;
    reviewRequestRef.current = controller;
    setReviewing(true);
    setReviewError(null);
    setReviewMessage(null);
    try {
      const { data } = await api.post(`/proctor/sessions/${attemptId}/review`, { decision, reason }, { signal: controller.signal });
      if (!activeRef.current || epoch !== epochRef.current) return;
      setSummary((previous) => previous ? { ...previous, ...data } : previous);
      setReviewMessage(data.certificateIssued ? 'Шешім сақталды. Сертификат қолжетімді.' : 'Тексеру шешімі сақталды.');
    } catch (failure: any) {
      if (controller.signal.aborted || !activeRef.current || epoch !== epochRef.current) return;
      const message = failure?.response?.data?.message;
      setReviewError(Array.isArray(message) ? message.join('. ') : message || 'Шешімді сақтау мүмкін болмады. Себеп сақталды, қайта жіберуге болады.');
      if ([401, 403, 404].includes(failure?.response?.status)) {
        deniedRef.current = true;
        setEvidences([]);
        setSummary(null);
      }
    } finally {
      if (reviewRequestRef.current === controller) reviewRequestRef.current = null;
      if (activeRef.current && epoch === epochRef.current) setReviewing(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/proctor" className="text-primary-600 hover:underline text-sm">
          ← Проктор панеліне оралу
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        Дәлелдемелер — {String(attemptId).slice(0, 8)}...
      </h1>

      <button type="button" onClick={() => { void refresh('manual'); }} className="mb-6 text-sm font-semibold text-primary-700 underline">
        Жазбалар мен күйді жаңарту
      </button>

      {summary && (
        <section className="card mb-6 space-y-3" aria-label="Емтиханды тексеру">
          <h2 className="text-lg font-semibold">{summary.exam.title} — тексеру</h2>
          <p className="text-sm">Нәтиже: {summary.score === null ? 'әлі тапсырылмады' : `${summary.score}%`} · Өту балы: {summary.exam.passScore}%</p>
          <p className="font-medium">
            {summary.reviewStatus === 'APPROVED' ? 'Мақұлданды' : summary.reviewStatus === 'REJECTED' ? 'Қабылданбады' : 'Тексеруді күтуде'}
            {summary.flaggedAt ? ' · 🚩 Назар аударуды қажет етеді' : ''}
          </p>
          {summary.reviewReason && <p className="text-sm whitespace-pre-wrap">Себеп: {summary.reviewReason}</p>}
          {summary.reviewedAt && <p className="text-xs text-gray-500">{new Date(summary.reviewedAt).toLocaleString('kk-KZ')}</p>}
          {!finished && <p className="text-sm text-gray-600">Студент емтиханды аяқтағаннан кейін шешім қабылдауға болады.</p>}
          {ownAttempt && <p className="text-sm text-amber-800">Өз талпынысыңызды тексеруге болмайды.</p>}
          {canReview && (
            <>
              <p className="text-sm text-gray-600">Камера мен экран жазбаларын қарап, шешімнің себебін жазыңыз. Сақталған шешімді өзгертуге болмайды.</p>
              {!canApprove && <p className="text-sm text-amber-800">Мақұлдау үшін өту балы және камера мен экранның толық жазбалары қажет.</p>}
              <label htmlFor="review-reason" className="block text-sm font-medium">Шешімнің себебі</label>
              <textarea id="review-reason" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)}
                minLength={3} maxLength={2000} required rows={4} disabled={reviewing}
                className="w-full rounded-lg border border-gray-300 p-3 text-sm" />
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={reviewing || !canApprove || reviewReason.trim().length < 3}
                  onClick={() => { void submitReview('APPROVED'); }} className="btn-primary disabled:opacity-50">Мақұлдау</button>
                <button type="button" disabled={reviewing || reviewReason.trim().length < 3}
                  onClick={() => { void submitReview('REJECTED'); }} className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50">Қабылдамау</button>
              </div>
              {reviewing && <p role="status" className="text-sm text-gray-500">Шешім сақталуда...</p>}
            </>
          )}
        </section>
      )}

      {reviewError && <p role="alert" className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">{reviewError}</p>}
      {reviewMessage && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">{reviewMessage}</p>}

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>{error}</p>
          <button type="button" onClick={() => { void refresh('manual'); }} className="mt-2 font-semibold underline">
            Қайта жүктеу
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        </div>
      ) : evidences.length === 0 && !error ? (
        <p className="text-gray-400 text-center py-12">Дәлелдеме жоқ</p>
      ) : (
        <div className="space-y-8">
          {cameras.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">📹 Камера жазбалары</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cameras.map((ev) => <EvidenceCard key={ev.id} ev={ev} revision={revision} onRefresh={refreshOnPlaybackError} />)}
              </div>
            </section>
          )}
          {screens.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">🖥️ Экран жазбалары</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {screens.map((ev) => <EvidenceCard key={ev.id} ev={ev} revision={revision} onRefresh={refreshOnPlaybackError} />)}
              </div>
            </section>
          )}
          {other.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">📎 Басқа дәлелдемелер</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {other.map((ev) => <EvidenceCard key={ev.id} ev={ev} revision={revision} onRefresh={refreshOnPlaybackError} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
