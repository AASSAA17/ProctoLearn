import Link from 'next/link';
import type { ReactNode } from 'react';

export function PremiumPublicFrame({ children, verificationOnly = false }: { children: ReactNode; verificationOnly?: boolean }) {
  return <div className="marketing-shell min-h-screen selection:bg-violet-500/30">
    <a href="#public-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-white focus:p-4 focus:text-slate-900">Мазмұнға өту</a>
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080b14]/90 backdrop-blur-xl">
      <nav aria-label="Негізгі навигация" className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        {verificationOnly
          ? <div className="flex min-h-11 items-center gap-2 font-bold tracking-tight sm:text-xl"><span aria-hidden="true" className="grid size-9 place-items-center rounded-xl border border-violet-400/40 bg-violet-500/20 text-violet-200">P</span><span>Procto<span className="text-violet-300">Learn</span></span></div>
          : <Link href="/" className="flex min-h-11 items-center gap-2 font-bold tracking-tight sm:text-xl"><span aria-hidden="true" className="grid size-9 place-items-center rounded-xl border border-violet-400/40 bg-violet-500/20 text-violet-200">P</span><span>Procto<span className="text-violet-300">Learn</span></span></Link>}
        {!verificationOnly && <div className="flex items-center gap-3 sm:gap-6"><Link href="/courses" className="hidden rounded-lg py-3 text-sm text-slate-300 transition-colors hover:text-white sm:block">Курстар</Link><Link href="/auth/login" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-semibold transition-colors hover:bg-white/10">Кіру <span aria-hidden="true" className="ml-2">↗</span></Link></div>}
      </nav>
    </header>
    <main id="public-content" className="mx-auto min-h-[75vh] max-w-7xl px-4 py-10 sm:px-8 sm:py-16">{children}</main>
    <footer className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-400 sm:px-8"><span>ProctoLearn · Білімге жол ашық.</span>{!verificationOnly && <Link href="/" className="rounded-lg py-3 hover:text-white">Басты бетке оралу ↗</Link>}</div></footer>
  </div>;
}

export function CourseCoverArt({ title, large = false }: { title: string; large?: boolean }) {
  const tone = Array.from(title).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  const tones = ['from-violet-950 via-[#202047] to-slate-950', 'from-cyan-950 via-[#12313e] to-slate-950', 'from-indigo-950 via-[#282050] to-slate-950'];
  return <div aria-hidden="true" className={`relative isolate overflow-hidden bg-gradient-to-br ${tones[tone]} ${large ? 'h-56 sm:h-72' : 'h-44'}`}>
    <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
    <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rotate-12 rounded-3xl border border-white/30 bg-white/5 shadow-[16px_16px_0_0_rgba(255,255,255,0.04)] transition-transform duration-300 group-hover:rotate-6"><span className="grid h-full place-items-center font-mono text-4xl text-white/80">{'</>'}</span></div>
    <span className="absolute bottom-4 left-5 font-mono text-[10px] uppercase tracking-[.25em] text-white/50">ProctoLearn / Academy</span>
  </div>;
}

export function PublicLoadingCards() {
  return <div role="status" aria-label="Курстар жүктелуде"><span className="sr-only">Курстар жүктелуде...</span><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(item => <div key={item} aria-hidden="true" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.03]"><div className="h-44 bg-white/5 motion-safe:animate-pulse" /><div className="space-y-4 p-6"><div className="h-4 w-1/3 rounded bg-white/10" /><div className="h-6 w-3/4 rounded bg-white/10" /><div className="h-4 rounded bg-white/5" /></div></div>)}</div></div>;
}
