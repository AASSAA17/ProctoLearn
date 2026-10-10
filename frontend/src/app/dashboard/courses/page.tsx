'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { NavIcon } from '@/components/nav-icon';
import Link from 'next/link';

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

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [certCourseIds, setCertCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeLevel, setActiveLevel] = useState<CourseLevel>('BEGINNER');
  const [enrollModal, setEnrollModal] = useState<{ course: Course } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const cancelEnrollmentRef = useRef<HTMLButtonElement>(null);
  const enrollmentTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enrollModal) return;
    cancelEnrollmentRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !enrolling) {
        setEnrollModal(null);
        enrollmentTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [enrollModal, enrolling]);

  // Free enrollment — no active-enrollment restriction

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesRes, enrollmentsRes, certsRes] = await Promise.allSettled([
        api.get('/courses?limit=200'),
        api.get('/enrollments/my'),
        api.get('/certificates/my'),
      ]);
      setLoadError([coursesRes, enrollmentsRes, certsRes].some(result => result.status === 'rejected'));

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
      setLoadError(true);
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
    enrollmentTriggerRef.current = document.activeElement as HTMLElement;
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
      <div role="status" aria-label="Курстар жүктелуде" className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="workspace-page-header">
        <div>
        <p className="workspace-eyebrow">Оқу кітапханасы</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Курстар</h1>
        <p className="mt-3 text-sm text-slate-500">Деңгейіңізді таңдаңыз. Келесі қадамыңызды бастаңыз.</p>
        </div>
        <span role="status" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">{filteredCourses.length} курс</span>
      </div>
      {loadError && <div role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Деректер толық жүктелмеді. <button type="button" onClick={() => void loadData()} className="font-semibold underline">Қайта жүктеу</button></div>}

      {enrollments.length > 0 && <section className="mb-6 rounded-2xl border bg-white p-5" aria-label="Тіркелген курстар">
        <h2 className="font-semibold mb-3">Менің оқуым</h2>
        <p className="text-sm text-gray-600 mb-3">Тіркелген курстар, соның ішінде каталогтан мұрағатталған материалдар.</p>
        <ul className="space-y-2">{enrollments.map((enrollment) => <li key={enrollment.id}>
          <Link className="text-primary-700 underline" href={`/dashboard/courses/${enrollment.courseId}`}>{enrollment.course.title}</Link>
          <span className="ml-2 text-sm text-gray-500">{enrollment.completedAt ? 'Аяқталған' : 'Оқуды жалғастыру'}</span>
        </li>)}</ul>
      </section>}

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {LEVEL_TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveLevel(tab.key)} aria-pressed={activeLevel === tab.key}
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
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white text-center py-16 text-gray-500"><NavIcon icon="📚" className="mx-auto mb-4 h-10 w-10 text-violet-400" /><p className="text-lg font-semibold text-slate-800">Курс табылмады</p><p className="mt-2 text-sm">Басқа деңгейді таңдап көріңіз.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
          {filteredCourses.map((course, idx) => {
            const enrollment = getEnrollment(course.id);
            const hasCert = certCourseIds.has(course.id);
            const isActive = !!(enrollment && !enrollment.completedAt);
            const coverHue = Array.from(course.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 70 + 225;
            let borderClass = 'border border-gray-200 hover:border-primary-300';
            let badgeEl: React.ReactNode = null;
            if (hasCert) { borderClass = 'border-2 border-green-400'; badgeEl = <span className="absolute top-3 right-3 bg-green-700 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">✅ Сертификат</span>; }
            else if (isActive) { borderClass = 'border-2 border-blue-400'; badgeEl = <span className="absolute top-3 right-3 bg-blue-700 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">📚 Белсенді</span>; }

            return (
              <button type="button" key={course.id} onClick={() => handleCourseClick(course)}
                aria-label={`${course.title}: ${isActive ? 'Жалғастыру' : hasCert ? 'Курсты ашу' : 'Курсқа тіркелу'}`}
                className={`text-left rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all bg-white h-full flex flex-col cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${borderClass}`}
              >
                <div className="relative h-40 w-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: `linear-gradient(130deg, hsl(${coverHue} 55% 94%), hsl(${coverHue + 30} 65% 86%))` }}>
                  <span aria-hidden="true" className="absolute h-40 w-40 rotate-45 rounded-[32px] border border-white/70" />
                  <span aria-hidden="true" className="absolute h-28 w-28 -rotate-12 rounded-3xl border border-white/80 bg-white/20" />
                  <span aria-hidden="true" className="relative grid h-16 w-16 place-items-center rounded-2xl border border-white bg-white/70 text-violet-700 shadow-sm"><NavIcon icon="📚" className="h-8 w-8" /></span>
                  {badgeEl}
                  <span className="absolute top-3 left-3 bg-black/40 text-white text-xs font-bold px-2 py-0.5 rounded-full">{idx + 1}-курс</span>
                </div>
                <div className="p-6 flex flex-col flex-1 w-full">
                  <h3 className={`text-xl font-semibold mb-3 leading-snug ${hasCert ? 'text-green-800' : 'text-gray-900'}`}>
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="text-sm mb-3 line-clamp-3 flex-1 text-gray-500">{course.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 items-center justify-between mt-auto pt-4 border-t text-xs text-gray-600 border-gray-100">
                    <span>👤 {course.teacher.name}</span>
                    <div className="flex gap-3"><span>📖 {course._count.lessons}</span><span>📝 {course._count.exams}</span></div>
                  </div>
                  {isActive && <p className="text-xs text-blue-600 mt-2 text-center font-medium">▶ Жалғастыру</p>}
                  {!hasCert && !isActive && <p className="text-xs text-primary-600 mt-2 text-center font-medium">+ Курсқа тіркелу</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {enrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="enroll-dialog-title" onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            if (buttons.length < 2) return;
            if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
            else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
          }} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="enroll-dialog-title" className="text-xl font-bold text-gray-900 mb-2">Курсқа тіркелу</h2>
            <p className="text-gray-600 mb-4"><strong>{enrollModal.course.title}</strong> курсын таңдадыңыз.</p>

            <div className="flex flex-wrap gap-2 mb-2 text-sm text-gray-700">
              <span className="bg-gray-100 rounded-lg px-3 py-1">Деңгей: <strong>{levelLabel(enrollModal.course.level)}</strong></span>
              <span className="bg-gray-100 rounded-lg px-3 py-1">📖 {enrollModal.course._count.lessons} сабақ</span>
              <span className="bg-gray-100 rounded-lg px-3 py-1">📝 {enrollModal.course._count.exams} тест</span>
            </div>
            <div className="flex gap-3 mt-6">
              <button ref={cancelEnrollmentRef} onClick={() => { setEnrollModal(null); enrollmentTriggerRef.current?.focus(); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">Болдырмау</button>
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
