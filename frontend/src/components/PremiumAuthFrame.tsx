import Link from 'next/link';
import type { ReactNode } from 'react';

export default function PremiumAuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="grid min-h-screen bg-[#f6f7fb] lg:grid-cols-[.95fr_1.05fr]">
    <aside className="relative hidden overflow-hidden bg-[#080b14] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-1/4 h-[36rem] w-[36rem] rounded-full bg-violet-600/15 blur-3xl" />
      <Link href="/" className="relative w-fit rounded-lg text-2xl font-bold tracking-tight">Procto<span className="text-violet-300">Learn</span></Link>
      <div className="relative max-w-lg py-20"><p className="mb-6 text-xs font-semibold uppercase tracking-[.24em] text-violet-300">Білім. Тәжірибе. Нәтиже.</p><h2 className="text-5xl font-semibold leading-[1.13] xl:text-6xl">Келесі қадам —<br /><span className="text-violet-300">жаңа білім.</span></h2><p className="mt-6 max-w-sm text-lg leading-relaxed text-slate-300">Курстарыңыз, оқу барысыңыз және жетістіктеріңіз бір кеңістікте.</p><div className="mt-12 grid gap-3 text-sm text-slate-300">{['Қазақ тіліндегі оқу кеңістігі', 'Сабақтар мен тәжірибелік тапсырмалар', 'Оқу барысын бақылау'].map((text, index) => <div key={text} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.03] p-4"><span className="font-mono text-violet-300">0{index + 1}</span>{text}</div>)}</div></div>
      <p className="relative text-xs text-slate-400">ProctoLearn · Өзіңізге инвестиция жасаңыз.</p>
    </aside>
    <div className="flex min-w-0 flex-col items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
      <Link href="/" className="mb-8 self-start rounded-lg text-sm font-medium text-slate-600 hover:text-violet-700 lg:mb-10">← Басты бетке</Link>
      <section className="w-full min-w-0 max-w-md break-words rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_16px_60px_-28px_rgba(30,41,59,0.25)] sm:p-9" aria-labelledby="auth-title">
        <p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-violet-700">ProctoLearn</p><h1 id="auth-title" className="text-3xl font-semibold leading-tight text-slate-900">{title}</h1><p className="mb-8 mt-3 text-sm leading-relaxed text-slate-600">{description}</p>{children}
      </section>
    </div>
  </main>;
}
