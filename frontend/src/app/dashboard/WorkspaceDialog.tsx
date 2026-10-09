'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal semantics provide keyboard containment and focus restoration. */
export function WorkspaceDialog({ title, children, onDismiss, busy = false }: {
  title: string; children: ReactNode; onDismiss: () => void; busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-label={title} className="workspace-modal" onCancel={(event) => { event.preventDefault(); if (!busy) onDismiss(); }} onClick={(event) => { if (!busy && event.target === event.currentTarget) onDismiss(); }}>
    <div>{children}</div>
  </dialog>;
}
