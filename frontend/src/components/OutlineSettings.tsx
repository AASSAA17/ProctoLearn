'use client';

import { useState } from 'react';
import api from '@/lib/api';

export default function OutlineSettings({ kind, item, onSaved, onCancel }: {
  kind: 'module' | 'lesson';
  item: { id: string; title: string; order: number };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const label = kind === 'module' ? 'Бөлім' : 'Сабақ';
  const [title, setTitle] = useState(item.title);
  const [order, setOrder] = useState(String(item.order));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!title.trim()) { setError('Атауды енгізіңіз.'); return; }
    if (!Number.isInteger(Number(order)) || Number(order) < 1) { setError('Реті оң бүтін сан болуы керек.'); return; }
    setSaving(true);
    try {
      await api.patch(`/${kind === 'module' ? 'modules' : 'lessons'}/${item.id}`, { title: title.trim(), order: Number(order) });
      onSaved();
    } catch {
      setError('Өзгерістер сақталмады. Енгізілген деректер сақталды, қайта көріңіз.');
    } finally { setSaving(false); }
  };

  return <form aria-label={`${label} параметрлері`} onSubmit={save} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
    <fieldset disabled={saving} className="min-w-0 space-y-3">
      <legend className="font-semibold text-gray-900">{label} параметрлері</legend>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <label className="block text-sm text-gray-700">{label} атауы
        <input autoFocus required value={title} onChange={event => setTitle(event.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
      </label>
      <label className="block text-sm text-gray-700">{label} реті
        <input type="number" required min={1} step={1} value={order} onChange={event => setOrder(event.target.value)} className="mt-1 block w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">{saving ? 'Сақталуда...' : 'Сақтау'}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">Болдырмау</button>
      </div>
    </fieldset>
  </form>;
}
