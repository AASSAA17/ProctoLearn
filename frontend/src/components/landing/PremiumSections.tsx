import Link from 'next/link';
import {
  AcademicCapIcon, ArrowRightIcon, ChartBarIcon, CheckBadgeIcon,
  CodeBracketIcon, CommandLineIcon, CubeTransparentIcon, CircleStackIcon,
  DocumentCheckIcon, LanguageIcon, ShieldCheckIcon, Square3Stack3DIcon,
} from '@heroicons/react/24/outline';

const technologies = [
  { name: 'HTML & CSS', icon: CodeBracketIcon, color: 'text-orange-300' },
  { name: 'JavaScript', icon: CommandLineIcon, color: 'text-amber-200' },
  { name: 'React', icon: CubeTransparentIcon, color: 'text-cyan-300' },
  { name: 'Python', icon: CommandLineIcon, color: 'text-sky-300' },
  { name: 'TypeScript', icon: CodeBracketIcon, color: 'text-blue-300' },
  { name: 'Node.js', icon: Square3Stack3DIcon, color: 'text-emerald-300' },
  { name: 'SQL', icon: CircleStackIcon, color: 'text-violet-300' },
  { name: 'Docker', icon: Square3Stack3DIcon, color: 'text-sky-300' },
];

const features = [
  { icon: AcademicCapIcon, title: 'Білімді тәжірибеге айналдыр', text: 'Оқу материалдары мен практикалық тапсырмаларды бір ортада орында. Қолжетімді тапсырмалар курс бағдарламасына байланысты.', wide: true },
  { icon: ChartBarIcon, title: 'Прогресіңді бақыла', text: 'Сабақтар мен тапсырмалардың орындалуын жеке кабинеттен көр.' },
  { icon: ShieldCheckIcon, title: 'Емтиханға сенімді орта', text: 'Онлайн емтихан, прокторинг оқиғалары және жазбаларды қарау құралдары.' },
  { icon: CheckBadgeIcon, title: 'Жетістігіңді раста', text: 'Талаптар орындалғаннан кейін берілген сертификатты PDF форматында жүктеп, QR арқылы тексер.', wide: true },
  { icon: LanguageIcon, title: 'Қазақ тіліндегі интерфейс', text: 'Өзіңе түсінікті ортада оқы. Оқу материалының тілі курсқа байланысты.' },
  { icon: DocumentCheckIcon, title: 'Нәтиже қолжетімді', text: 'Емтихан талпыныстары мен нәтижелерін жеке кабинеттен қара.' },
];

export function TechnologyCategories() {
  return (
    <section aria-labelledby="technology-heading" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <h2 id="technology-heading" className="text-xl font-semibold text-white">Технология әлемін зертте</h2>
        <p className="text-sm text-slate-400">Қолжетімді бағдарламаларды каталогтан қара</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {technologies.map(({ name, icon: Icon, color }) => (
          <li key={name} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-4 transition-transform duration-200 hover:-translate-y-1">
            <Icon aria-hidden="true" className={`mb-4 h-7 w-7 ${color}`} />
            <span className="text-sm font-medium text-slate-200">{name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PremiumFeatures() {
  return (
    <section id="features" aria-labelledby="features-heading" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-24 sm:px-6">
      <p className="eyebrow text-violet-300">Оқуға арналған бір кеңістік</p>
      <h2 id="features-heading" className="mt-4 max-w-2xl text-[clamp(1.875rem,4vw,2.25rem)] font-bold text-white">Әр қадам — жаңа мүмкіндік.</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {features.map(({ icon: Icon, title, text, wide }) => (
          <article key={title} className={`premium-card relative overflow-hidden p-6 sm:p-8 ${wide ? 'md:col-span-2' : ''}`}>
            {wide && <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-violet-500/10 blur-3xl" />}
            <Icon aria-hidden="true" className="h-8 w-8 text-violet-300" />
            <h3 className="mt-8 text-[1.375rem] font-semibold text-white">{title}</h3>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LearningProcess() {
  const steps = [
    ['Тіркел', 'Жеке кабинетіңді аш.'],
    ['Курсты таңда', 'Бағдарламасы мен деңгейін қара.'],
    ['Үйрен және орында', 'Сабақтар мен тапсырмаларды аяқта.'],
    ['Емтихан тапсыр', 'Курс талаптарына сай біліміңді көрсет.'],
    ['Сертификат ал', 'Қажетті талаптар орындалғанда.'],
    ['QR арқылы тексер', 'Сертификаттың ашық тексеру бетін қолдан.'],
  ];
  return (
    <section id="how" aria-labelledby="process-heading" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24 sm:px-6">
      <p className="eyebrow text-cyan-300">Оқу жолы</p>
      <h2 id="process-heading" className="mt-4 text-3xl font-bold text-white">Алғашқы қадамнан нәтижеге дейін.</h2>
      <p className="mt-4 max-w-2xl leading-7 text-slate-300">Нақты оқу реті, емтиханға қолжетімділік пен сертификат талаптары таңдалған курсқа байланысты.</p>
      <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map(([title, text], index) => (
          <li key={title} className="border-t border-white/15 pt-5">
            <span className="text-sm font-medium text-violet-300">0{index + 1}</span>
            <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PremiumCTA() {
  return (
    <section aria-labelledby="cta-heading" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <div className="rounded-[2rem] border border-violet-300/20 bg-gradient-to-br from-violet-500/20 to-cyan-400/10 p-8 sm:p-12">
        <p className="eyebrow text-violet-200">Келесі қадам — сенікі</p>
        <h2 id="cta-heading" className="mt-4 max-w-2xl text-3xl font-bold text-white sm:text-4xl">Бүгін үйрен. Ертең қолдан.</h2>
        <p className="mt-4 max-w-xl leading-7 text-slate-300">Курстарды зерттеп, өз оқу жолыңды баста.</p>
        <Link href="/auth/register" className="premium-button mt-8 gap-3 bg-white text-slate-950 hover:bg-cyan-100">Тіркелу <ArrowRightIcon aria-hidden="true" className="h-4 w-4" /></Link>
      </div>
    </section>
  );
}
