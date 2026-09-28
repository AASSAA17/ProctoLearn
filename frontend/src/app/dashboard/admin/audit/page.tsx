'use client';

import { useAuthStore } from '@/store/auth.store';
import { useCursorFeed } from '@/lib/use-cursor-feed';

interface AuditEvent {
  id: string; createdAt: string; actorId: string | null; action: string;
  targetType: string; targetId: string | null; metadata: Record<string, unknown> | null;
}

export default function AuditPage() {
  const role = useAuthStore((state) => state.user?.role);
  if (role !== 'ADMIN') return <p role="alert">Бұл бөлім тек әкімшіге қолжетімді.</p>;
  return <AuditFeed />;
}

function AuditFeed() {
  const feed = useCursorFeed<AuditEvent>('/admin/audit', 50);
  return <section className="space-y-5" aria-busy={feed.loading}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Әрекеттер журналы</h1><button className="btn-secondary" disabled={feed.loading} onClick={() => void feed.reload()}>Жаңарту</button></div>
    <p className="text-sm text-gray-600">Әкімшілік әрекеттер мен жазбаларды жою тарихы. Емтихан және апелляция шешімдері тиісті талпыныстың тарихында көрсетіледі. Оқиғалар жаңасынан ескісіне қарай реттелген.</p>
    {feed.error && <div role="alert" className="rounded-lg bg-red-50 p-4 space-y-2"><p>{feed.error}</p><button className="underline" disabled={feed.loading} onClick={() => void feed.retry()}>Қайта жүктеу</button></div>}
    {feed.loading && <p role="status">Жүктелуде...</p>}
    {!feed.loading && !feed.error && !feed.rows.length && <p className="card text-gray-500">Журналда оқиға жоқ.</p>}
    <ul className="space-y-3">
      {feed.rows.map((event) => <li key={event.id} className="card space-y-3 break-words">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{event.action}</h2><time className="text-sm text-gray-500" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('kk-KZ')}</time></div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Орындаушының ID</dt><dd className="font-mono break-all">{event.actorId ?? 'Жүйе'}</dd></div>
          <div><dt className="text-gray-500">Нысан</dt><dd>{event.targetType}<span className="block font-mono break-all">{event.targetId ?? '—'}</span></dd></div>
        </dl>
        {event.metadata && Object.keys(event.metadata).length > 0 && <details><summary className="cursor-pointer text-sm text-primary-700">Оқиға мәліметтері</summary><pre className="mt-2 whitespace-pre-wrap break-all rounded bg-gray-50 p-3 text-xs">{JSON.stringify(event.metadata, null, 2)}</pre></details>}
      </li>)}
    </ul>
    {feed.nextCursor && <button className="btn-secondary" disabled={feed.loading} onClick={() => void feed.loadMore()}>Тағы жүктеу</button>}
  </section>;
}
