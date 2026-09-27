'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

type Candidate = { id: string; name: string };
type Assignment = { proctorId: string; proctor: Candidate };

export default function ProctorAssignments({ examId }: { examId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const [assigned, available] = await Promise.all([
        api.get<Assignment[]>(`/proctor/exams/${examId}/assignments`, { signal }),
        api.get<Candidate[]>(`/proctor/exams/${examId}/candidates`, { signal }),
      ]);
      if (signal?.aborted) return;
      setAssignments(assigned.data);
      setCandidates(available.data);
      setSelected('');
    } catch {
      if (!signal?.aborted) setError('Прокторларды жүктеу мүмкін болмады. Қайта көріңіз.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const change = async (proctorId: string, revoke: boolean) => {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const path = `/proctor/exams/${examId}/assignments/${proctorId}`;
      if (revoke) await api.delete(path);
      else await api.put(path);
      setStatus(revoke ? 'Проктордың рұқсаты қайтарылды.' : 'Проктор тағайындалды.');
      await load();
    } catch {
      setError('Проктор рұқсатын өзгерту мүмкін болмады. Қайта көріңіз.');
    } finally {
      setBusy(false);
    }
  };

  const available = candidates.filter((candidate) => !assignments.some((assignment) => assignment.proctorId === candidate.id));
  return (
    <section aria-label="Емтихан прокторлары" className="rounded-lg border border-gray-200 p-3 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Емтихан прокторлары</h3>
      <p className="text-xs text-gray-500">Тағайындалған прокторлар осы емтиханның сессиялары мен жазбаларын көре алады.</p>
      {status && <p role="status" className="text-sm text-green-700">{status}</p>}
      {error && (
        <div role="alert" className="text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} disabled={busy || loading} className="mt-1 underline disabled:opacity-50">Қайта жүктеу</button>
        </div>
      )}
      {loading ? <p role="status" className="text-sm text-gray-500">Прокторлар жүктелуде…</p> : !error && (
        <>
          {assignments.length ? (
            <ul className="space-y-2">
              {assignments.map((assignment) => (
                <li key={assignment.proctorId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{assignment.proctor.name}</span>
                  <button type="button" disabled={busy} onClick={() => void change(assignment.proctorId, true)} className="text-red-600 underline disabled:opacity-50" aria-label={`${assignment.proctor.name}: рұқсатты қайтару`}>Рұқсатты қайтару</button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">Проктор тағайындалмаған.</p>}
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex-1 min-w-40 text-xs text-gray-600">
              Прокторды таңдаңыз
              <select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy || !available.length} className="mt-1 w-full border border-gray-300 rounded px-2 py-2 text-sm bg-white disabled:opacity-50">
                <option value="">{available.length ? 'Таңдаңыз' : 'Қолжетімді проктор жоқ'}</option>
                {available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy || !selected} onClick={() => void change(selected, false)} className="rounded bg-primary-600 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Сақталуда…' : 'Тағайындау'}</button>
          </div>
          {!candidates.length && <p className="text-xs text-gray-500">Әкімші пайдаланушыға проктор рөлін бергеннен кейін ол осы тізімде пайда болады.</p>}
        </>
      )}
    </section>
  );
}
