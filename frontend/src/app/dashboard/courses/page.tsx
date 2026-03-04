'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

interface Course {
  id: string;
  title: string;
  description?: string;
  level: CourseLevel;
  teacher: { name: string };
  _count: { lessons: number; exams: number };
}

interface Enrollment {
  id: string;
  courseId: string;
  completedAt: string | null;
  course: { id: string; title: string; level: CourseLevel };
}

const LEVEL_TABS: { key: CourseLevel; label: string; emoji: string; color: string; bg: string }[] = [
  { key: 'BEGINNER',     label: 'Жаңадан бастаушы', emoji: '🟢', color: 'text-green-700',  bg: 'bg-green-50 border-green-400' },
  { key: 'INTERMEDIATE', label: 'Орта деңгей',      emoji: '🟡', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-400' },
  { key: 'ADVANCED',     label: 'Жоғары деңгей',    emoji: '🔴', color: 'text-red-700',    bg: 'bg-red-50 border-red-400' },
];

const COURSE_COVERS = [
  { img: 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=400&q=80', overlay: 'from-yellow-900/70 to-orange-900/50', emoji: '⚡' },
  { img: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&q=80', overlay: 'from-blue-900/70 to-blue-700/50',    emoji: '🐍' },
  { img: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=400&q=80',    overlay: 'from-teal-900/70 to-cyan-800/50',   emoji: '🗄️' },
  { img: 'https://images.unsplash.com/photo-1621839673705-6617adf9e890?w=400&q=80', overlay: 'from-pink-900/70 to-rose-800/50',   emoji: '🎨' },
  { img: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&q=80', overlay: 'from-cyan-900/70 to-blue-800/50',   emoji: '⚛️' },
  { img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&q=80',    overlay: 'from-green-900/70 to-emerald-800/50', emoji: '🟢' },
  { img: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=400&q=80',    overlay: 'from-purple-900/70 to-violet-800/50', emoji: '📊' },
  { img: 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=400&q=80',    overlay: 'from-orange-900/70 to-red-800/50',  emoji: '🔀' },
  { img: 'https://images.unsplash.com/photo-1605745341112-85968b19335b?w=400&q=80', overlay: 'from-sky-900/70 to-indigo-800/50',  emoji: '🐳' },
  { img: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&q=80',    overlay: 'from-red-900/70 to-rose-800/50',    emoji: '🔒' },
];

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [certCourseIds, setCertCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeLevel, setActiveLevel] = useState<CourseLevel>('BEGINNER');
  const [enrollModal, setEnrollModal] = useState<{ course: Course } | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  // Free enrollment — no active-enrollment restriction

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesRes, enrollmentsRes, certsRes] = await Promise.allSettled([
        api.get('/courses?limit=200'),
        api.get('/enrollments/my'),
        api.get('/certificates/my'),
      ]);

      if (coursesRes.status === 'fulfilled') {
        const list: Course[] = coursesRes.value.data.data ?? coursesRes.value.data;
        setCourses(list);
      }
      if (enrollmentsRes.status === 'fulfilled') {
        setEnrollments(enrollmentsRes.value.data);
      }
      if (certsRes.status === 'fulfilled') {
        const ids = new Set<string>(certsRes.value.data.map((c: any) => c.course?.id ?? c.courseId));
        setCertCourseIds(ids);
      }
    } catch {
      toast.error('Деректерді жүктеу қатесі');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getEnrollment = (courseId: string) => enrollments.find(e => e.courseId === courseId);

  const handleCourseClick = (course: Course) => {
    const enrollment = getEnrollment(course.id);
    if (enrollment && !enrollment.completedAt) { router.push(`/dashboard/courses/${course.id}`); return; }
    if (certCourseIds.has(course.id)) { router.push(`/dashboard/courses/${course.id}`); return; }
    setEnrollModal({ course });
  };

  const confirmEnroll = async () => {
    if (!enrollModal) return;
    setEnrolling(true);
    try {
      await api.post(`/enrollments/courses/${enrollModal.course.id}`);
      toast.success(`"${enrollModal.course.title}" курсына тіркелдіңіз!`);
      setEnrollModal(null);
      await loadData();
      router.push(`/dashboard/courses/${enrollModal.course.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Тіркелу қатесі');
      setEnrollModal(null);
    } finally {
      setEnrolling(false);
    }
  };

  const levelLabel = (l: CourseLevel) =>
    l === 'BEGINNER' ? 'Жаңадан бастаушы' : l === 'INTERMEDIATE' ? 'Орта деңгей' : 'Жоғары деңгей';

  const filteredCourses = courses.filter(c => c.level === activeLevel);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Курстар</h1>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {LEVEL_TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveLevel(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-all whitespace-nowrap ${
              activeLevel === tab.key ? `${tab.bg} ${tab.color} shadow-sm` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <span>{tab.emoji}</span>
            {tab.label}
            <span className="ml-1 bg-gray-200 text-gray-600 text-xs rounded-full px-1.5 py-0.5">
              {courses.filter(c => c.level === tab.key).length}
            </span>
          </button>
        ))}
      </div>

      {filteredCourses.length === 0 ? (
        <div className="text-center py-16 text-gray-500"><p className="text-lg">Курс табылмады</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course, idx) => {
            const enrollment = getEnrollment(course.id);
            const hasCert = certCourseIds.has(course.id);
            const isActive = !!(enrollment && !enrollment.completedAt);
            const cover = COURSE_COVERS[idx % COURSE_COVERS.length];
            let borderClass = 'border border-gray-200 hover:border-primary-300';
            let badgeEl: React.ReactNode = null;
            if (hasCert) { borderClass = 'border-2 border-green-400'; badgeEl = <span className="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">✅ Сертификат</span>; }
            else if (isActive) { borderClass = 'border-2 border-blue-400'; badgeEl = <span className="absolute top-3 right-3 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">📚 Белсенді</span>; }

            return (
              <div key={course.id} onClick={() => handleCourseClick(course)}
                className={`rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all bg-white h-full flex flex-col cursor-pointer ${borderClass}`}
              >
                <div className="relative h-36 flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-800">
                  <img src={cover.img} alt={course.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  <div className={`absolute inset-0 bg-gradient-to-br ${cover.overlay}`} />
                  <span className="relative text-5xl drop-shadow-lg">{cover.emoji}</span>
                  {badgeEl}
                  <span className="absolute top-3 left-3 bg-black/40 text-white text-xs font-bold px-2 py-0.5 rounded-full">{idx + 1}-курс</span>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className={`text-base font-semibold mb-2 leading-tight ${hasCert ? 'text-green-800' : 'text-gray-900'}`}>
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="text-sm mb-3 line-clamp-3 flex-1 text-gray-500">{course.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t text-xs text-gray-400 border-gray-100">
                    <span>👤 {course.teacher.name}</span>
                    <div className="flex gap-3"><span>📖 {course._count.lessons}</span><span>📝 {course._count.exams}</span></div>
                  </div>
                  {isActive && <p className="text-xs text-blue-600 mt-2 text-center font-medium">▶ Жалғастыру</p>}
                  {!hasCert && !isActive && <p className="text-xs text-primary-600 mt-2 text-center font-medium">+ Курсқа тіркелу</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {enrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Курсқа тіркелу</h2>
            <p className="text-gray-600 mb-4"><strong>{enrollModal.course.title}</strong> курсын таңдадыңыз.</p>

            <div className="flex gap-2 mb-2 text-sm text-gray-500">
              <span className="bg-gray-100 rounded-lg px-3 py-1">Деңгей: <strong>{levelLabel(enrollModal.course.level)}</strong></span>
              <span className="bg-gray-100 rounded-lg px-3 py-1">📖 {enrollModal.course._count.lessons} сабақ</span>
              <span className="bg-gray-100 rounded-lg px-3 py-1">📝 {enrollModal.course._count.exams} тест</span>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEnrollModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">Болдырмау</button>
              <button onClick={confirmEnroll} disabled={enrolling} className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50">
                {enrolling ? 'Тіркелуде...' : 'Растаймын, тіркелемін'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
