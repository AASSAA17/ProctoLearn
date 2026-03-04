'use client';

import Link from 'next/link';
import React from 'react';
import {
  HomeIcon,
  BookOpenIcon,
  TrophyIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  CurrencyDollarIcon,
  LockClosedIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

/* ──────────────────────────────────────────────────────────────────────────────
 * FeatureIcon – maps feature titles to Heroicons
 * ────────────────────────────────────────────────────────────────────────── */
const FEATURE_ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  'Сертификат аласыз': TrophyIcon,
  'Прокторинг жүйесі': ShieldCheckIcon,
  'Қадамдай оқыту': BookOpenIcon,
  'Кезекпен өту': LockClosedIcon,
  'Қазақ тілінде': GlobeAltIcon,
  'Тегін бастау': CurrencyDollarIcon,
};

/* ──────────────────────────────────────────────────────────────────────────────
 * HeroSection
 * ────────────────────────────────────────────────────────────────────────── */
export function HeroSection() {
  return (
    <section className="relative bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 text-white overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-10 right-20 w-96 h-96 rounded-full bg-blue-300 blur-3xl" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 md:py-32">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
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
              <AcademicCapIcon className="w-5 h-5 inline-block mr-2 -mt-0.5" aria-hidden="true" />
              Тегін бастау
            </Link>
            <a
              href="#courses"
              className="border-2 border-white/50 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 transition-colors text-center text-lg"
            >
              <BookOpenIcon className="w-5 h-5 inline-block mr-2 -mt-0.5" aria-hidden="true" />
              Курстарды қарау
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * StatsBar
 * ────────────────────────────────────────────────────────────────────────── */
export function StatsBar() {
  const stats = [
    { val: '58+', label: 'Курс' },
    { val: '500+', label: 'Сабақ' },
    { val: '1 000+', label: 'Студент' },
    { val: '100%', label: 'Тегін тіркелу' },
  ];

  return (
    <section className="bg-primary-700 text-white py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold text-yellow-400">{s.val}</p>
              <p className="text-primary-200 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * TechCategories
 * ────────────────────────────────────────────────────────────────────────── */
const TECH_CATEGORIES = [
  { icon: '🌐', name: 'HTML & CSS', desc: 'Веб-беттің негізі', color: 'from-orange-400 to-red-400' },
  { icon: '⚡', name: 'JavaScript', desc: 'Ең танымал тіл', color: 'from-yellow-400 to-orange-400' },
  { icon: '⚛️', name: 'React', desc: 'UI кітапхана', color: 'from-cyan-400 to-blue-400' },
  { icon: '🐍', name: 'Python', desc: 'Деректер ғылымы', color: 'from-blue-400 to-indigo-400' },
  { icon: '🦕', name: 'TypeScript', desc: 'Типті JS', color: 'from-blue-500 to-blue-700' },
  { icon: '🔴', name: 'Node.js', desc: 'Серверлік JS', color: 'from-green-500 to-emerald-600' },
  { icon: '🗄️', name: 'SQL', desc: 'Дерекқор тілі', color: 'from-purple-400 to-violet-500' },
  { icon: '🐳', name: 'Docker', desc: 'Контейнерлер', color: 'from-sky-400 to-blue-500' },
];

export function TechCategoriesSection() {
  return (
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
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-2xl`}
                aria-hidden="true"
              >
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
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * FeaturesSection
 * ────────────────────────────────────────────────────────────────────────── */
export interface Feature {
  icon: string;
  title: string;
  desc: string;
}

export function FeaturesSection({ features }: { features: Feature[] }) {
  return (
    <section id="features" className="py-16 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Неге ProctoLearn?</h2>
        <p className="text-gray-500 text-center mb-12">Басқа платформалардан айырмашылығымыз</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f) => {
            const Icon = FEATURE_ICON_MAP[f.title];
            return (
              <div
                key={f.title}
                className="flex gap-4 p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                {Icon ? (
                  <Icon className="w-10 h-10 text-primary-600 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <span className="text-4xl flex-shrink-0" aria-hidden="true">{f.icon}</span>
                )}
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * HowItWorks
 * ────────────────────────────────────────────────────────────────────────── */
const STEPS_DATA = [
  { step: '01', icon: '📝', title: 'Тіркелу', desc: 'Тегін тіркелу. Email мен пароль кіргізіңіз.' },
  { step: '02', icon: '📚', title: 'Курс таңдау', desc: 'Деңгейіңізге сай курс таңдаңыз.' },
  { step: '03', icon: '🎓', title: 'Сабақ оқу', desc: 'Мазмұн оқыңыз, тапсырма орындаңыз.' },
  { step: '04', icon: '🏆', title: 'Сертификат', desc: 'Емтихан тапсырып, сертификат алыңыз.' },
];

export function HowItWorksSection() {
  return (
    <section className="py-16 bg-primary-700 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-bold mb-2 text-center">Қалай жұмыс істейді?</h2>
        <p className="text-primary-200 text-center mb-12">4 қадамда мамандық алыңыз</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS_DATA.map((item) => (
            <div key={item.step} className="text-center">
              <div
                className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl text-3xl mb-4"
                aria-hidden="true"
              >
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
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Testimonials
 * ────────────────────────────────────────────────────────────────────────── */
export interface Testimonial {
  name: string;
  role: string;
  text: string;
  avatar: string;
  stars: number;
}

export function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section id="reviews" className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Студенттердің пікірлері</h2>
        <p className="text-gray-500 text-center mb-12">Оқып, жұмысқа орналасқандар айтады</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex gap-1 text-yellow-400 mb-4" aria-label={`${t.stars} жұлдыз`}>
                {'★'.repeat(t.stars)}
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6 italic">&quot;{t.text}&quot;</p>
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
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * CTA Banner
 * ────────────────────────────────────────────────────────────────────────── */
export function CTABanner() {
  return (
    <section className="py-20 bg-gradient-to-r from-primary-700 to-primary-500 text-white text-center">
      <div className="max-w-2xl mx-auto px-4">
        <h2 className="text-4xl font-extrabold mb-4">Бүгін бастаңыз!</h2>
        <p className="text-primary-200 text-lg mb-8">Тіркелу тегін. Бірінші курсты тегін бастаңыз.</p>
        <Link
          href="/auth/register"
          className="inline-block bg-white text-primary-700 font-extrabold text-lg px-10 py-4 rounded-2xl hover:bg-gray-100 transition-colors shadow-xl"
        >
          <AcademicCapIcon className="w-5 h-5 inline-block mr-2 -mt-0.5" aria-hidden="true" />
          Тегін тіркелу
        </Link>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Footer
 * ────────────────────────────────────────────────────────────────────────── */
export function Footer() {
  return (
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
              <li>
                <a href="mailto:info@proctolearn.kz" className="hover:text-white transition-colors">
                  📧 info@proctolearn.kz
                </a>
              </li>
              <li>🌐 Қазақстан, Алматы</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
          <p>© {new Date().getFullYear()} ProctoLearn. Барлық құқықтар қорғалған.</p>
          <p>Нақты уақыттағы прокторинг · Trust Score · Сертификаттар</p>
        </div>
      </div>
    </footer>
  );
}
