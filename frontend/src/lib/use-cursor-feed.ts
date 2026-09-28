'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from './api';

interface Page<T> { data: T[]; nextCursor: string | null; unreadCount?: number }

export function useCursorFeed<T extends { id: string }>(endpoint: string, limit: number) {
  const [rows, setRows] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const failedCursor = useRef<string | null>(null);

  const load = useCallback(async (cursor: string | null = null) => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    failedCursor.current = cursor;
    setLoading(true); setError('');
    try {
      const { data } = await api.get<Page<T>>(endpoint, { params: { limit, ...(cursor ? { cursor } : {}) }, signal: controller.signal });
      if (controller.signal.aborted) return;
      setRows((previous) => cursor ? [...new Map([...previous, ...data.data].map((row) => [row.id, row])).values()] : data.data);
      setNextCursor(data.nextCursor);
      if (typeof data.unreadCount === 'number') setUnreadCount(data.unreadCount);
    } catch (failure: any) {
      if (!controller.signal.aborted) setError(failure?.response?.status === 403
        ? 'Бұл бөлімге кіруге рұқсат жоқ.' : 'Деректерді жүктеу мүмкін болмады. Қайта көріңіз.');
    } finally {
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  }, [endpoint, limit]);

  useEffect(() => {
    void load();
    return () => { pending.current?.abort(); pending.current = null; };
  }, [load]);

  return { rows, setRows, nextCursor, unreadCount, setUnreadCount, loading, error,
    reload: () => load(), loadMore: () => nextCursor ? load(nextCursor) : Promise.resolve(),
    retry: () => load(failedCursor.current) };
}
