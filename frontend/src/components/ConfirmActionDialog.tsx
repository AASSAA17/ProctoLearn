'use client';

import { useEffect, useId, useRef, useState } from 'react';

export default function ConfirmActionDialog({ title, description, requireReason = false, onConfirm, onClose }: {
  title: string; description: string; requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
    <form aria-busy={busy} onSubmit={async event => {
      event.preventDefault(); if (busy || (requireReason && reason.trim().length < 3)) return;
      setBusy(true); setError('');
      try { await onConfirm(reason.trim()); onClose(); }
      catch { setError('Әрекетті орындау мүмкін болмады. Деректерді тексеріп, қайталап көріңіз.'); setBusy(false); }
    }}>
      <h2 id={`${id}-title`} className="text-xl font-semibold">{title}</h2>
      <p id={`${id}-description`} className="mt-3 break-words text-sm leading-relaxed text-slate-600">{description}</p>
      {requireReason && <div className="mt-4"><label htmlFor={`${id}-reason`} className="text-sm font-medium">Себебі (кемінде 3 таңба)</label>
        <textarea id={`${id}-reason`} className="input mt-2 min-h-24" required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></div>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" className="btn-secondary min-h-11" onClick={onClose} disabled={busy} autoFocus={!requireReason}>Бас тарту</button>
        <button type="submit" className="btn-primary min-h-11" disabled={busy || (requireReason && reason.trim().length < 3)}>{busy ? 'Орындалуда…' : 'Растау'}</button>
      </div>
    </form>
  </dialog>;
}
