'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';

interface Evidence {
  id: string;
  type: string;
  url: string;
  createdAt: string;
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
  const [evidences, setEvidences] = useState<Evidence[]>([]);
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
    if (pendingRef.current) return pendingRef.current.promise;
    // Multiple videos can fail together; retry once and avoid a source-error loop.
    if (reason === 'error') {
      if (Date.now() - lastErrorRefreshRef.current < 10_000) return;
      lastErrorRefreshRef.current = Date.now();
    }
    const epoch = epochRef.current;
    const controller = new AbortController();
    const promise = api.get<Evidence[]>(`/evidence/${attemptId}`, { signal: controller.signal })
      .then(({ data }) => {
        if (!activeRef.current || epoch !== epochRef.current) return;
        deniedRef.current = false;
        setEvidences(data);
        setRevision((value) => value + 1);
        setError(null);
      })
      .catch((failure) => {
        if (controller.signal.aborted || !activeRef.current || epoch !== epochRef.current) return;
        if ([401, 403, 404].includes(failure?.response?.status)) {
          deniedRef.current = true;
          setEvidences([]);
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
    };
  }, [refresh]);

  const refreshOnPlaybackError = useCallback(() => { void refresh('error'); }, [refresh]);

  const cameras = evidences.filter((e) => e.type === 'recording_camera');
  const screens = evidences.filter((e) => e.type === 'recording_screen');
  const other = evidences.filter((e) => !e.type?.startsWith('recording_'));

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
