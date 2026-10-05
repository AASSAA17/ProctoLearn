'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Pagination from '@/components/Pagination';

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

const COURSES_MENU_ITEMS = [
  {
    key: 'BEGINNER',
    color: '#120F17',
    title: 'Жаңадан бастаушы',
    description: 'Іргетас және негізгі ұғымдар',
    label: '🟢 Бастау'
  },
  {
    key: 'INTERMEDIATE',
    color: '#120F17',
    title: 'Орта деңгей',
    description: 'Практика, жобалар, сенімділік',
    label: '🟡 Даму'
  },
  {
    key: 'ADVANCED',
    color: '#120F17',
    title: 'Жоғары деңгей',
    description: 'Күрделі кейстер және архитектура',
    label: '🔴 Про'
  },
  {
    key: 'BEGINNER_INFO',
    color: '#120F17',
    title: 'Негіз',
    description: 'HTML, CSS, JS және алгоритмдер',
    label: 'Бағыт'
  },
  {
    key: 'INTERMEDIATE_INFO',
    color: '#120F17',
    title: 'Қолдану',
    description: 'React, API, дерекқор интеграциясы',
    label: 'Практика'
  },
  {
    key: 'ADVANCED_INFO',
    color: '#120F17',
    title: 'Шеберлік',
    description: 'Сапа, қауіпсіздік, production ойлау',
    label: 'Кәсіби'
  }
];

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [certCourseIds, setCertCourseIds] = useState<Set<string>>(new Set());
  type Dataset = 'courses' | 'enrollments' | 'certificates';
  type Status = 'loading' | 'success' | 'error';
  const [status, setStatus] = useState<Record<Dataset, Status>>({ courses: 'loading', enrollments: 'loading', certificates: 'loading' });
  const [confirmed, setConfirmed] = useState<Record<Dataset, boolean>>({ courses: false, enrollments: false, certificates: false });
  const requests = useRef({ courses: 0, enrollments: 0, certificates: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
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

  const loadDataset = useCallback(async (dataset: Dataset) => {
    const request = ++requests.current[dataset];
    setStatus(prev => ({ ...prev, [dataset]: 'loading' }));
    try {
      const { data } = await api.get(dataset === 'courses'
        ? `/courses?page=${page}&limit=20&level=${activeLevel}`
        : dataset === 'enrollments' ? '/enrollments/my' : '/certificates/my');
      if (requests.current[dataset] !== request) return;
      if (dataset === 'courses') {
        setCourses(data.data);
        setTotalPages(data.totalPages);
      } else if (dataset === 'enrollments') {
        setEnrollments(data);
      } else {
        setCertCourseIds(new Set<string>(data.map((c: { course?: { id: string }; courseId: string }) => c.course?.id ?? c.courseId)));
      }
      setConfirmed(prev => ({ ...prev, [dataset]: true }));
      setStatus(prev => ({ ...prev, [dataset]: 'success' }));
    } catch {
      if (requests.current[dataset] === request) setStatus(prev => ({ ...prev, [dataset]: 'error' }));
    }
  }, [page, activeLevel]);

  useEffect(() => {
    void loadDataset('courses');
    return () => { requests.current.courses++; };
  }, [loadDataset]);

  useEffect(() => {
    void loadDataset('enrollments');
    void loadDataset('certificates');
    const currentRequests = requests.current;
    return () => { currentRequests.enrollments++; currentRequests.certificates++; };
  }, [loadDataset]);

  const changePage = (next: number) => {
    requests.current.courses++;
    setCourses([]);
    setConfirmed(prev => ({ ...prev, courses: false }));
    setStatus(prev => ({ ...prev, courses: 'loading' }));
    setPage(next);
  };
  const changeLevel = (level: CourseLevel) => {
    if (level === activeLevel) return;
    changePage(1);
    setActiveLevel(level);
  };
  const actionsReady = status.enrollments === 'success' && status.certificates === 'success' && status.courses === 'success';

  const getEnrollment = (courseId: string) => enrollments.find(e => e.courseId === courseId);

  const handleCourseClick = (course: Course) => {
    if (!actionsReady) return;
    const enrollment = getEnrollment(course.id);
    if (enrollment && !enrollment.completedAt) { router.push(`/dashboard/courses/${course.id}`); return; }
    if (certCourseIds.has(course.id)) { router.push(`/dashboard/courses/${course.id}`); return; }
    enrollmentTriggerRef.current = document.activeElement as HTMLElement;
    setEnrollModal({ course });
  };

  const confirmEnroll = async () => {
    if (!enrollModal || !actionsReady) return;
    setEnrolling(true);
    try {
      await api.post(`/enrollments/courses/${enrollModal.course.id}`);
      toast.success(`"${enrollModal.course.title}" курсына тіркелдіңіз!`);
      setEnrollModal(null);
      await loadDataset('enrollments');
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


  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Курстар</h1>
      </div>


      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {LEVEL_TABS.map(tab => (
          <button key={tab.key} onClick={() => changeLevel(tab.key)} aria-pressed={activeLevel === tab.key}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-all whitespace-nowrap ${
              activeLevel === tab.key ? `${tab.bg} ${tab.color} shadow-sm` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <span>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {(['courses', 'enrollments', 'certificates'] as const).map(dataset => (
        <div key={dataset}>
          {status[dataset] === 'loading' && <p role="status">{dataset}: Жүктелуде...</p>}
          {status[dataset] === 'error' && <div role="alert" className="mb-3 text-red-700">
            {dataset}: Деректерді жүктеу қатесі. {confirmed[dataset] ? 'Соңғы расталған деректер көрсетілген (ескірген).' : 'Деректер белгісіз.'}
            <button className="ml-2 underline" onClick={() => void loadDataset(dataset)}>Қайталау: {dataset}</button>
          </div>}
        </div>
      ))}
      <button className="mb-3 underline" disabled={Object.values(status).includes('loading')} onClick={() => {
        void loadDataset('courses'); void loadDataset('enrollments'); void loadDataset('certificates');
      }}>Жаңарту</button>
      {status.courses === 'success' && filteredCourses.length === 0 ? (
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
            if (hasCert) { borderClass = 'border-2 border-green-400'; badgeEl = <span className="absolute top-3 right-3 bg-green-700 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">✅ Сертификат</span>; }
            else if (isActive) { borderClass = 'border-2 border-blue-400'; badgeEl = <span className="absolute top-3 right-3 bg-blue-700 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">📚 Белсенді</span>; }

            return (
              <button type="button" key={course.id} disabled={!actionsReady} onClick={() => handleCourseClick(course)}
                aria-label={`${course.title}: ${!actionsReady ? 'Күйі белгісіз' : isActive ? 'Жалғастыру' : hasCert ? 'Курсты ашу' : 'Курсқа тіркелу'}`}
                className={`text-left rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all bg-white h-full flex flex-col cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${borderClass}`}
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
                  <div className="flex items-center justify-between mt-auto pt-2 border-t text-xs text-gray-600 border-gray-100">
                    <span>👤 {course.teacher.name}</span>
                    <div className="flex gap-3"><span>📖 {course._count.lessons}</span><span>📝 {course._count.exams}</span></div>
                  </div>
                  {isActive && <p className="text-xs text-blue-600 mt-2 text-center font-medium">▶ Жалғастыру</p>}
                  {actionsReady && !hasCert && !isActive && <p className="text-xs text-primary-600 mt-2 text-center font-medium">+ Курсқа тіркелу</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={changePage} disabled={status.courses === 'loading'} />

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

            <div className="flex gap-2 mb-2 text-sm text-gray-700">
              <span className="bg-gray-100 rounded-lg px-3 py-1">Деңгей: <strong>{levelLabel(enrollModal.course.level)}</strong></span>
              <span className="bg-gray-100 rounded-lg px-3 py-1">📖 {enrollModal.course._count.lessons} сабақ</span>
              <span className="bg-gray-100 rounded-lg px-3 py-1">📝 {enrollModal.course._count.exams} тест</span>
            </div>
            <div className="flex gap-3 mt-6">
              <button ref={cancelEnrollmentRef} onClick={() => { setEnrollModal(null); enrollmentTriggerRef.current?.focus(); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">Болдырмау</button>
              <button onClick={confirmEnroll} disabled={enrolling || !actionsReady} className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50">
                {enrolling ? 'Тіркелуде...' : 'Растаймын, тіркелемін'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
