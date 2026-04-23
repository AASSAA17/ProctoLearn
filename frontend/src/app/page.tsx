'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import {
  StatsBar,
  TechCategoriesSection,
  FeaturesSection,
  HowItWorksSection,
  TestimonialsSection,
  CTABanner,
  Footer,
} from '@/components/landing/sections';

import GooeyNav from '@/components/landing/GooeyNav';

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
    desc: 'Тақырыпты түсін — тапсырма орында — емтихан тапсыр. Нәтижелі оқу жолы.',
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
    fetch(`${API_URL}/courses?limit=12`)
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
      {/* ─── Gooey Navigation ─── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-extrabold text-primary-700">Procto</span>
            <span className="text-2xl font-extrabold text-gray-800">Learn</span>
          </Link>
          
          <div className="flex-1 max-w-sm">
            <GooeyNav
              items={[
                { label: 'Курстар', href: '#courses' },
                { label: 'Мүмкіндіктер', href: '#features' },
                { label: 'Пікірлер', href: '#reviews' },
              ]}
              initialActiveIndex={0}
              animationTime={600}
              particleCount={15}
              colors={[1, 2, 3, 1, 2]}
            />
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

      <section className="bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600 text-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4">Технологияны өзінше үйрен</h1>
          <p className="text-lg sm:text-xl text-primary-100 mb-8">Интерактивті платформада сертификат аласыз</p>
          <Link
            href="/auth/register"
            className="inline-flex items-center bg-white text-primary-700 font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Бұл сәтті бастаңыз →
          </Link>
        </div>
      </section>

      <StatsBar />
      <TechCategoriesSection />

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

      <FeaturesSection features={FEATURES} />
      <HowItWorksSection />
      <TestimonialsSection testimonials={TESTIMONIALS} />
      <CTABanner />
      <Footer />
    </div>
  );
}
