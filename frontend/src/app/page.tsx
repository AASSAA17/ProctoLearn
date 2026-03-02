'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Course {
  id: string;
  title: string;
  description: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  teacher?: { name: string };
  _count?: { lessons: number; enrollments: number };
}

const LEVEL_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  BEGINNER:     { label: 'Бастаушы',    color: 'text-green-700',  bg: 'bg-green-100' },
  INTERMEDIATE: { label: 'Орта',        color: 'text-yellow-700', bg: 'bg-yellow-100' },
  ADVANCED:     { label: 'Жоғары',      color: 'text-red-700',    bg: 'bg-red-100' },
};

const TECH_CATEGORIES = [
  { icon: '🌐', name: 'HTML & CSS',      desc: 'Веб-беттің негізі', color: 'from-orange-400 to-red-400' },
  { icon: '⚡', name: 'JavaScript',      desc: 'Ең танымал тіл',    color: 'from-yellow-400 to-orange-400' },
  { icon: '⚛️', name: 'React',           desc: 'UI кітапхана',      color: 'from-cyan-400 to-blue-400' },
  { icon: '🐍', name: 'Python',          desc: 'Деректер ғылымы',   color: 'from-blue-400 to-indigo-400' },
  { icon: '🦕', name: 'TypeScript',      desc: 'Типті JS',          color: 'from-blue-500 to-blue-700' },
  { icon: '🔴', name: 'Node.js',         desc: 'Серверлік JS',      color: 'from-green-500 to-emerald-600' },
  { icon: '🗄️', name: 'SQL',             desc: 'Дерекқор тілі',    color: 'from-purple-400 to-violet-500' },
  { icon: '🐳', name: 'Docker',          desc: 'Контейнерлер',      color: 'from-sky-400 to-blue-500' },
];

const FEATURES = [
  {
    icon: '🏆',
    title: 'Сертификат аласыз',
    desc: 'Курсты аяқтаған соң ресми сертификат беріледі. PDF форматта жүктеп, LinkedIn-ге қоюға болады.',
  },
  {
    icon: '👁️',
    title: 'Прокторинг жүйесі',
    desc: 'Real-time AI прокторинг арқылы барлық емтихандар адал орындалады. Trust Score технологиясы.',
  },
  {
    icon: '📚',
    title: 'Қадамдай оқыту',
    desc: 'Stepik стилінде: тақырыпты түсінд — тапсырма орында — емтихан тапсыр. Нәтижелі оқу жолы.',
  },
  {
    icon: '🔒',
    title: 'Кезекпен өту',
    desc: 'Алдыңғы сабақты аяқтамай келесіге өте алмайсыз. Білімді тереңдетіп,сапалы оқитын жүйе.',
  },
  {
    icon: '🌐',
    title: 'Қазақ тілінде',
    desc: 'Барлық курстар қазақ тілінде жасалған. Ана тіліңізде технологияларды үйрен.',
  },
  {
    icon: '💻',
    title: 'Тегін бастау',
    desc: 'Тіркелу тегін. Алғашқы курсты тегін бастаңыз. Сапалы білім — барлығына қолжетімді.',
  },
];

const TESTIMONIALS = [
  {
    name: 'Алибек Жаксенов',
    role: 'Frontend Developer @ KazMunayGas IT',
    text: 'ProctoLearn-де HTML мен JavaScript-ті үйреніп, 3 айда жұмысқа орналасты. Аты-жөнді курстар!',
    avatar: 'АЖ',
    stars: 5,
  },
  {
    name: 'Айгерім Сейткалиева',
    role: 'Junior Python Dev @ Kolesa Group',
    text: 'Прокторинг жүйесі алдауды мүмкін емес қылады. Сертификат жұмыс берушіге сенімді болды.',
    avatar: 'АС',
    stars: 5,
  },
  {
    name: 'Санат Досжанов',
    role: 'Student @ IITU',
    text: 'Кезекпен сабақтар өту менің оқу тәртібімді жақсартты. Қазақ тілінде болуы өте ыңғайлы!',
    avatar: 'СД',
    stars: 5,
  },
];

export default function HomePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [activeLevel, setActiveLevel] = useState<string>('ALL');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/courses?limit=12`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setCourses(list);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoadingCourses(false));
  }, []);

  const filtered = activeLevel === 'ALL' ? courses : courses.filter((c) => c.level === activeLevel);

  return (
    <div className="min-h-screen bg-white">
      {/* ─── Navbar ─── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-extrabold text-primary-700">Procto</span>
            <span className="text-2xl font-extrabold text-gray-800">Learn</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#courses" className="hover:text-primary-600 font-medium transition-colors">Курстар</a>
            <a href="#features" className="hover:text-primary-600 font-medium transition-colors">Мүмкіндіктер</a>
            <a href="#reviews" className="hover:text-primary-600 font-medium transition-colors">Пікірлер</a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm text-gray-700 font-medium hover:text-primary-700 transition-colors"
            >
              Кіру
            </Link>
            <Link
              href="/auth/register"
              className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Тегін бастау
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white blur-3xl"></div>
          <div className="absolute bottom-10 right-20 w-96 h-96 rounded-full bg-blue-300 blur-3xl"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm mb-6">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Қазақстандағы №1 IT оқыту платформасы
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
              IT мамандығын<br />
              <span className="text-yellow-400">қазақ тілінде</span><br />
              үйрен
            </h1>
            <p className="text-xl text-primary-200 mb-10 max-w-xl leading-relaxed">
              HTML, JavaScript, Python, React және тағы басқа технологияларды бастаушыдан кәсіпкерге дейін үйрен.
              Сертификат ал. Жұмысқа орналас.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/auth/register"
                className="bg-white text-primary-700 font-bold px-8 py-4 rounded-xl hover:bg-gray-100 transition-colors text-center text-lg shadow-lg"
              >
                🚀 Тегін бастау
              </Link>
              <a
                href="#courses"
                className="border-2 border-white/50 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 transition-colors text-center text-lg"
              >
                📚 Курстарды қарау
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats bar ─── */}
      <section className="bg-primary-700 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { val: '58+',    label: 'Курс' },
              { val: '500+',   label: 'Сабақ' },
              { val: '1 000+', label: 'Студент' },
              { val: '100%',   label: 'Тегін тіркелу' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-extrabold text-yellow-400">{s.val}</p>
                <p className="text-primary-200 text-sm mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Categories ─── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Технологиялар</h2>
          <p className="text-gray-500 text-center mb-10">Заманауи IT индустриясының ең сұранысты бағыттары</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TECH_CATEGORIES.map((cat) => (
              <Link
                key={cat.name}
                href="/auth/register"
                className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 border border-gray-100 flex items-center gap-3"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-2xl`}>
                  {cat.icon}
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{cat.name}</p>
                  <p className="text-xs text-gray-500">{cat.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Featured Courses ─── */}
      <section id="courses" className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Танымал курстар</h2>
          <p className="text-gray-500 mb-8">Мыңдаған студент оқып жатқан курстар</p>

          {/* Level filter tabs */}
          <div className="flex gap-2 mb-8 flex-wrap">
            {['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setActiveLevel(lvl)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeLevel === lvl
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {lvl === 'ALL' ? '📋 Барлығы' :
                 lvl === 'BEGINNER' ? '🟢 Бастаушы' :
                 lvl === 'INTERMEDIATE' ? '🟡 Орта' : '🔴 Жоғары'}
              </button>
            ))}
          </div>

          {loadingCourses ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="bg-gray-100 rounded-2xl h-56 animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.slice(0, 9).map((course) => {
                const lvl = LEVEL_LABELS[course.level] || LEVEL_LABELS.BEGINNER;
                return (
                  <Link
                    key={course.id}
                    href="/auth/register"
                    className="bg-white rounded-2xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all group overflow-hidden"
                  >
                    <div className={`h-3 w-full ${
                      course.level === 'BEGINNER' ? 'bg-green-400' :
                      course.level === 'INTERMEDIATE' ? 'bg-yellow-400' : 'bg-red-400'
                    }`}></div>
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${lvl.bg} ${lvl.color}`}>
                          {lvl.label}
                        </span>
                        {course._count?.lessons && (
                          <span className="text-xs text-gray-400">{course._count.lessons} сабақ</span>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900 text-base mb-2 group-hover:text-primary-700 transition-colors line-clamp-2">
                        {course.title}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mb-4">{course.description}</p>
                      {course.teacher && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <span className="w-5 h-5 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">
                            {course.teacher.name[0]}
                          </span>
                          {course.teacher.name}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="text-center mt-10">
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
            >
              Барлық курстарды көру →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Неге ProctoLearn?</h2>
          <p className="text-gray-500 text-center mb-12">Басқа платформалардан айырмашылығымыз</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4 p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <span className="text-4xl flex-shrink-0">{f.icon}</span>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="py-16 bg-primary-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold mb-2 text-center">Қалай жұмыс істейді?</h2>
          <p className="text-primary-200 text-center mb-12">4 қадамда мамандық алыңыз</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: '01', icon: '📝', title: 'Тіркелу', desc: 'Тегін тіркелу. Email мен пароль кіргізіңіз.' },
              { step: '02', icon: '📚', title: 'Курс таңдау', desc: 'Деңгейіңізге сай курс таңдаңыз.' },
              { step: '03', icon: '🎓', title: 'Сабақ оқу', desc: 'Мазмұн оқыңыз, тапсырма орындаңыз.' },
              { step: '04', icon: '🏆', title: 'Сертификат', desc: 'Емтихан тапсырып, сертификат алыңыз.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl text-3xl mb-4">
                  {item.icon}
                </div>
                <div className="text-yellow-400 font-bold text-sm mb-1">{item.step}</div>
                <h3 className="font-bold text-white text-lg mb-2">{item.title}</h3>
                <p className="text-primary-200 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="reviews" className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Студенттердің пікірлері</h2>
          <p className="text-gray-500 text-center mb-12">Оқып, жұмысқа орналасқандар айтады</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex gap-1 text-yellow-400 mb-4">
                  {'★'.repeat(t.stars)}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-6 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="py-20 bg-gradient-to-r from-primary-700 to-primary-500 text-white text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-4xl font-extrabold mb-4">Бүгін бастаңыз!</h2>
          <p className="text-primary-200 text-lg mb-8">Тіркелу тегін. Бірінші курсты тегін бастаңыз.</p>
          <Link
            href="/auth/register"
            className="inline-block bg-white text-primary-700 font-extrabold text-lg px-10 py-4 rounded-2xl hover:bg-gray-100 transition-colors shadow-xl"
          >
            🚀 Тегін тіркелу
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-1 mb-3">
                <span className="text-xl font-extrabold text-white">Procto</span>
                <span className="text-xl font-extrabold text-primary-400">Learn</span>
              </div>
              <p className="text-sm leading-relaxed">
                Қазақстандық IT мамандарын дайындайтын заманауи онлайн оқыту платформасы.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Курстар</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/auth/register" className="hover:text-white transition-colors">HTML & CSS</Link></li>
                <li><Link href="/auth/register" className="hover:text-white transition-colors">JavaScript</Link></li>
                <li><Link href="/auth/register" className="hover:text-white transition-colors">Python</Link></li>
                <li><Link href="/auth/register" className="hover:text-white transition-colors">React</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Платформа</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/auth/login" className="hover:text-white transition-colors">Жүйеге кіру</Link></li>
                <li><Link href="/auth/register" className="hover:text-white transition-colors">Тіркелу</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Байланыс</h4>
              <ul className="space-y-2 text-sm">
                <li>📧 info@proctolearn.kz</li>
                <li>🌐 Қазақстан, Алматы</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
            <p>© 2025 ProctoLearn. Барлық құқықтар қорғалған.</p>
            <p>Нақты уақыттағы прокторинг · Trust Score · Сертификаттар</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
