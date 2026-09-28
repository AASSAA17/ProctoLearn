'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { notificationTarget } from '@/lib/public-links';
import { useCursorFeed } from '@/lib/use-cursor-feed';

interface Notification {
  id: string; type: string; title: string; body: string; targetPath: string | null;
  createdAt: string; readAt: string | null;
}

export default function NotificationsPage() {
  const feed = useCursorFeed<Notification>('/notifications', 20);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  const markRead = async (notification: Notification) => {
    if (request.current || feed.loading || notification.readAt) return;
    const controller = new AbortController();
    request.current = controller;
    setReading(notification.id); setReadError('');
    try {
      await api.patch(`/notifications/${notification.id}/read`, {}, { signal: controller.signal });
      if (controller.signal.aborted) return;
      feed.setRows((rows) => rows.map((row) => row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row));
      feed.setUnreadCount((value) => Math.max(0, value - 1));
    } catch {
      if (!controller.signal.aborted) setReadError('Оқылғанын белгілеу мүмкін болмады. Қайта басып көріңіз.');
    } finally {
      if (request.current === controller) { request.current = null; setReading(null); }
    }
  };

  return <section className="max-w-3xl mx-auto space-y-5" aria-busy={feed.loading}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Хабарландырулар</h1><button className="btn-secondary" disabled={feed.loading || !!reading} onClick={() => void feed.reload()}>Жаңарту</button></div>
    <p role="status" aria-live="polite">Оқылмаған: {feed.unreadCount}</p>
    {feed.error && <div role="alert" className="rounded-lg bg-red-50 p-4 space-y-2"><p>{feed.error}</p><button className="underline" disabled={feed.loading || !!reading} onClick={() => void feed.retry()}>Қайта жүктеу</button></div>}
    {readError && <p role="alert" className="rounded-lg bg-amber-50 p-3">{readError}</p>}
    {feed.loading && <p role="status">Жүктелуде...</p>}
    {!feed.loading && !feed.error && !feed.rows.length && <p className="card text-gray-500">Әзірге хабарландыру жоқ.</p>}
    <ul className="space-y-3">
      {feed.rows.map((notification) => {
        const target = notificationTarget(notification.targetPath);
        return <li key={notification.id} className={`card space-y-2 break-words ${notification.readAt ? '' : 'border-primary-300'}`}>
          <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{notification.title}</h2>{!notification.readAt && <span className="text-sm text-primary-700">Жаңа</span>}</div>
          <p className="whitespace-pre-wrap text-gray-700">{notification.body}</p>
          <time className="block text-xs text-gray-500" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString('kk-KZ')}</time>
          <div className="flex flex-wrap gap-4 pt-2">
            {target && <Link href={target} className="text-primary-700 underline">Толығырақ</Link>}
            {!notification.readAt && <button disabled={!!reading || feed.loading} onClick={() => void markRead(notification)} className="text-primary-700 underline disabled:opacity-50">{reading === notification.id ? 'Сақталуда...' : 'Оқылды деп белгілеу'}</button>}
          </div>
        </li>;
      })}
    </ul>
    {feed.nextCursor && <button className="btn-secondary" disabled={feed.loading || !!reading} onClick={() => void feed.loadMore()}>Тағы жүктеу</button>}
  </section>;
}
