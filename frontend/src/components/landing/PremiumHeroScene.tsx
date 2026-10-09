'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const KnowledgeScene = dynamic(() => import('./KnowledgeScene'), { ssr: false });

function StaticHeroObject() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/30 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rotate-12 rounded-[2.5rem] border border-cyan-200/40 bg-gradient-to-br from-violet-500/60 via-fuchsia-500/30 to-cyan-300/40 shadow-[0_0_90px_rgba(139,92,246,.35)] backdrop-blur-2xl" />
      <div className="absolute inset-x-10 bottom-8 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
    </div>
  );
}

export default function PremiumHeroScene() {
  const container = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = window.matchMedia('(min-width: 768px)');
    let visible = false;
    const update = () => setEnabled(visible && desktop.matches && !motion.matches && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    if (container.current) observer.observe(container.current);
    motion.addEventListener('change', update);
    desktop.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', update);
      desktop.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return (
    <div ref={container} aria-hidden="true" className="relative h-[300px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#101525] sm:h-[420px]">
      <StaticHeroObject />
      {enabled && <KnowledgeScene />}
      <div className="pointer-events-none absolute left-6 top-6 text-xs tracking-[0.2em] text-cyan-200">PROCTOLEARN / KNOWLEDGE</div>
      <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4 text-xs text-slate-300">
        <span>Білім. Тәжірибе. Нәтиже.</span><span className="rounded-full border border-white/20 px-3 py-1">01 — ∞</span>
      </div>
    </div>
  );
}
