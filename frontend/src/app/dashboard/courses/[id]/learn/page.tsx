'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import StepContent from '@/components/learning/StepContent';
import Link from 'next/link';
import { saveLearningProgress } from '@/lib/learning-progress';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
  id: string;
  type: 'VIDEO' | 'TEXT' | 'TASK';
  order: number;
  content: Record<string, any>;
}

interface Lesson {
  id: string;
  title: string;
  order: number;
  steps: Step[];
  hasAssignment?: boolean;
}

interface CourseModule {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  modules: CourseModule[];
}

// ─── Flat navigation list ─────────────────────────────────────────────────────
interface NavItem {
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
  stepId: string;
  stepOrder: number;
  stepType: Step['type'];
}

function buildNavList(modules: CourseModule[]): NavItem[] {
  const items: NavItem[] = [];
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      for (const step of lesson.steps) {
        items.push({
          moduleId: mod.id,
          moduleTitle: mod.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          stepId: step.id,
          stepOrder: step.order,
          stepType: step.type,
        });
      }
    }
  }
  return items;
}

// ─── Step type icons ──────────────────────────────────────────────────────────
const STEP_ICONS: Record<Step['type'], string> = { VIDEO: '▶️', TEXT: '📝', TASK: '✏️' };

// ─── Main Learn Page ──────────────────────────────────────────────────────────
export default function LearnPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStepId = searchParams.get('step');

  const [course, setCourse] = useState<Course | null>(null);
  const [navList, setNavList] = useState<NavItem[]>([]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(initialStepId);
  const currentLesson = course?.modules.flatMap((module) => module.lessons).find((lesson) => lesson.steps.some((step) => step.id === currentStepId)) ?? null;
  const currentStep = currentLesson?.steps.find((step) => step.id === currentStepId) ?? null;
  const navigateToStep = setCurrentStepId;
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [courseError, setCourseError] = useState(false);
  const [courseRetry, setCourseRetry] = useState(0);
  const [progress, setProgress] = useState<Record<string, { loading: boolean; error: boolean; confirmed: boolean }>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const generation = useRef(0);

  const loadProgress = useCallback(async (key: string, version: number) => {
    setProgress((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: false } }));
    try {
      const { data } = await api.get(key === 'course'
        ? `/submissions/course/${courseId}/progress`
        : `/submissions/lesson/${key}/progress`);
      if (generation.current !== version) return;
      if (key !== 'course') {
        const completed = data.filter((step: { completed: boolean }) => step.completed).map((step: { id: string }) => step.id);
        setCompletedStepIds((prev) => new Set([...prev, ...completed]));
      }
      setProgress((prev) => ({ ...prev, [key]: { loading: false, error: false, confirmed: true } }));
    } catch {
      if (generation.current !== version) return;
      setProgress((prev) => ({ ...prev, [key]: { ...prev[key], loading: false, error: true } }));
    }
  }, [courseId]);

  // Ignore late responses after navigation or a replacement request.
  useEffect(() => {
    const version = ++generation.current;
    const load = async () => {
      setLoading(true);
      setCourseError(false);
      setCourse(null);
      setCompletedStepIds(new Set());
      setProgress({});
      try {
        const { data } = await api.get(`/courses/${courseId}/material`);
        if (generation.current !== version) return;
        const courseData: Course = data;
        setCourse(courseData);
        const list = buildNavList(courseData.modules ?? []);
        setNavList(list);
        navigateToStep(initialStepId ?? list[0]?.stepId ?? null);
        const keys = ['course', ...courseData.modules.flatMap((mod) => mod.lessons.map((lesson) => lesson.id))];
        setProgress(Object.fromEntries(keys.map((key) => [key, { loading: true, error: false, confirmed: false }])));
        keys.forEach((key) => { void loadProgress(key, version); });
      } catch {
        if (generation.current === version) setCourseError(true);
      } finally {
        if (generation.current === version) setLoading(false);
      }
    };
    void load();
    return () => { generation.current = version + 1; };
  }, [courseId, initialStepId, navigateToStep, loadProgress, courseRetry]);

  const handleStepComplete = useCallback(async () => {
    if (!currentStep || !currentLesson) return;
    const version = generation.current;
    const saved = await saveLearningProgress(api, courseId, currentLesson, currentStep);
    if (generation.current !== version) return;
    setCompletedStepIds((prev) => new Set([...prev, ...saved.completedStepIds]));
    toast.success(saved.lessonCompleted ? 'Сабақ аяқталды! 🎉' : 'Прогресс сақталды');
  }, [courseId, currentStep, currentLesson]);

  const goToNextStep = useCallback(() => {
    const idx = navList.findIndex((n) => n.stepId === currentStepId);
    if (idx < navList.length - 1) {
      navigateToStep(navList[idx + 1].stepId);
    } else {
      router.push(`/dashboard/courses/${courseId}`);
    }
  }, [navList, currentStepId, navigateToStep, courseId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-500">Жүктелуде...</p>
        </div>
      </div>
    );
  }
  if (courseError) return (
    <div role="alert" className="p-6 text-red-700">
      <p>Курс жүктеу қатесі</p>
      <button onClick={() => setCourseRetry((value) => value + 1)}>Қайта жүктеу</button>
    </div>
  );
  if (!course) return null;
  const progressKnown = Object.values(progress).every((item) => item.confirmed);
  const progressLoading = Object.values(progress).some((item) => item.loading);
  const failedProgress = Object.entries(progress).filter(([, item]) => item.error);

  const currentIdx = navList.findIndex((n) => n.stepId === currentStepId);
  const hasNext = currentIdx < navList.length - 1;
  const isCurrentCompleted = currentStepId ? completedStepIds.has(currentStepId) : false;

  // Group nav list by module for sidebar rendering
  const sidebarModules = course.modules;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 overflow-hidden flex-shrink-0 bg-white border-r border-gray-200 flex flex-col`}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-semibold text-gray-800 text-sm truncate">{course.title}</span>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600 ml-2">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 py-2">
          {sidebarModules.map((mod) => (
            <div key={mod.id} className="mb-2">
              <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">
                {mod.order}. {mod.title}
              </div>
              {mod.lessons.map((lesson) => (
                <div key={lesson.id}>
                  <div className="px-4 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 flex items-center gap-1">
                    📖 {lesson.title}
                  </div>
                  {lesson.steps.map((step) => {
                    const done = completedStepIds.has(step.id);
                    const active = step.id === currentStepId;
                    return (
                      <button
                        key={step.id}
                        onClick={() => navigateToStep(step.id)}
                        className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition text-left ${
                          active
                            ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-xs">{STEP_ICONS[step.type]}</span>
                        <span className="flex-1 truncate">
                          {step.order}-қадам
                        </span>
                        {done && <span className="text-green-500 text-xs">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          {/* Breadcrumb + sidebar toggle */}
          <div className="flex items-center gap-3 mb-6">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                ☰
              </button>
            )}
            {currentLesson && (
              <div className="text-sm text-gray-500 flex items-center gap-1">
                <span>{currentLesson.title}</span>
                <span className="text-gray-300">›</span>
                <span className="text-gray-700 font-medium">
                  {STEP_ICONS[currentStep?.type ?? 'TEXT']} {currentStep?.order}-қадам
                </span>
              </div>
            )}
          </div>

          <button
            disabled={progressLoading}
            onClick={() => Object.keys(progress).forEach((key) => { void loadProgress(key, generation.current); })}
            className="mb-3 text-sm text-primary-700 disabled:opacity-50"
          >
            Прогресті жаңарту
          </button>
          {progressLoading && <p role="status">Прогресс жүктелуде...</p>}
          {failedProgress.length > 0 && (
            <div role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-amber-900">
              <p>Прогрестің бір бөлігі жүктелмеді. Расталған прогресс сақталды; қалғаны белгісіз.</p>
              {failedProgress.some(([, item]) => item.confirmed) && <p>Соңғы расталған прогресс көрсетілген; деректер ескірген болуы мүмкін.</p>}
              <button onClick={() => failedProgress.forEach(([key]) => { void loadProgress(key, generation.current); })}>
                Прогресті қайта жүктеу
              </button>
            </div>
          )}
          {/* Step content */}
          {currentStep ? (
            <div className="space-y-6">
              <StepContent key={currentStep.id} step={currentStep} onComplete={handleStepComplete} />
              {currentLesson?.hasAssignment && (
                <Link href={`/dashboard/courses/${courseId}/lessons/${currentLesson.id}`} className="block text-primary-700 underline">
                  Сабақтың жазбаша тапсырмасын орындау →
                </Link>
              )}
              {/* Next step button */}
              {isCurrentCompleted && (
                <div className="pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={goToNextStep}
                    className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition flex items-center gap-2"
                  >
                    {hasNext ? 'Келесі қадам →' : 'Курсқа оралу →'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-3">📚</p>
              <p>{navList.length === 0 ? 'Курста қадамдар жоқ' : 'Сол жақтан қадамды таңдаңыз'}</p>
            </div>
          )}

          {/* Progress bar */}
          {navList.length > 0 && progressKnown && (
            <div className="mt-8 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>Прогрес</span>
                <span>{completedStepIds.size} / {navList.length} қадам</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(completedStepIds.size / navList.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
