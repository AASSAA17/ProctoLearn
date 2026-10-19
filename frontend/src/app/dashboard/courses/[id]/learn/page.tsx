'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import StepContent from '@/components/learning/StepContent';
import Link from 'next/link';
import { saveLearningProgress } from '@/lib/learning-progress';
import {
  buildLearningNavList,
  chooseLearningStep,
  countCompletedLearningSteps,
  type LearningNavItem,
} from '@/lib/learning-navigation';
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

// ─── Step type icons ──────────────────────────────────────────────────────────
const STEP_ICONS: Record<Step['type'], string> = { VIDEO: '▶️', TEXT: '📝', TASK: '✏️' };
const STEP_LABELS: Record<Step['type'], string> = { VIDEO: 'Бейне', TEXT: 'Оқу', TASK: 'Тапсырма' };
const NO_COMPLETED_STEPS: ReadonlySet<string> = new Set();

// ─── Main Learn Page ──────────────────────────────────────────────────────────
export default function LearnPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStepId = searchParams.get('step');

  const [course, setCourse] = useState<Course | null>(null);
  const [navList, setNavList] = useState<LearningNavItem[]>([]);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [progressReady, setProgressReady] = useState(false);
  const [progressError, setProgressError] = useState(false);
  const [progressRetry, setProgressRetry] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusStepAfterNavigation = useRef(false);
  const currentStepId = progressReady ? chooseLearningStep(navList, initialStepId, progressError ? NO_COMPLETED_STEPS : completedStepIds) : null;
  const currentLesson = course?.modules.flatMap((module) => module.lessons).find((lesson) => lesson.steps.some((step) => step.id === currentStepId)) ?? null;
  const currentStep = currentLesson?.steps.find((step) => step.id === currentStepId) ?? null;

  const navigateToStep = (stepId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', stepId);
    focusStepAfterNavigation.current = true;
    setSidebarOpen(false);
    router.push(`/dashboard/courses/${courseId}/learn?${params.toString()}`, { scroll: false });
  };

  // Load course structure
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setProgressReady(false);
      setProgressError(false);
      try {
        const { data } = await api.get(`/courses/${courseId}/material`);
        const courseData: Course = data;
        setCourse(courseData);
        const list = buildLearningNavList(courseData.modules ?? []);
        setNavList(list);

        // Per-lesson progress is the source of truth for the outline and is loaded
        // independently of the aggregate progress projection.
        const allLessons = (courseData.modules ?? []).flatMap((module: CourseModule) => module.lessons);
        const completedIds = new Set<string>();
        const progressResults = await Promise.allSettled(
          allLessons.map((lesson: Lesson) => api.get(`/submissions/lesson/${lesson.id}/progress`)),
        );
        progressResults.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          (result.value.data ?? []).forEach((step: any) => {
            if (step.completed) completedIds.add(step.id);
          });
        });
        setCompletedStepIds(completedIds);
        setProgressError(progressResults.some((result) => result.status === 'rejected'));
        setProgressReady(true);
      } catch {
        toast.error('Курс жүктеу қатесі');
        router.push(`/dashboard/courses/${courseId}`);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [courseId, progressRetry, router]);

  // Preserve a valid direct URL/back-forward location. Without an explicit step,
  // continue at the first server-confirmed unfinished step.
  useEffect(() => {
    if (loading || !progressReady) return;
    const selected = chooseLearningStep(navList, initialStepId, progressError ? NO_COMPLETED_STEPS : completedStepIds);
    if (selected && selected !== initialStepId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', selected);
      router.replace(`/dashboard/courses/${courseId}/learn?${params.toString()}`, { scroll: false });
    }
  }, [completedStepIds, courseId, initialStepId, loading, navList, progressError, progressReady, router, searchParams]);

  useEffect(() => {
    if (!focusStepAfterNavigation.current || !currentStepId) return;
    focusStepAfterNavigation.current = false;
    contentHeadingRef.current?.focus();
  }, [currentStepId]);

  const handleStepComplete = async () => {
    if (!currentStep || !currentLesson) return;
    const saved = await saveLearningProgress(api, courseId, currentLesson, currentStep);
    setCompletedStepIds((prev) => new Set([...prev, ...saved.completedStepIds]));
    if (saved.lessonCompleted) toast.success('Сабақ аяқталды! 🎉');
  };

  const goToNextStep = () => {
    const idx = navList.findIndex((n) => n.stepId === currentStepId);
    if (idx < navList.length - 1) {
      navigateToStep(navList[idx + 1].stepId);
    } else {
      router.push(`/dashboard/courses/${courseId}`);
    }
  };

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
  if (!course) return null;

  const currentIdx = navList.findIndex((n) => n.stepId === currentStepId);
  const hasNext = currentIdx < navList.length - 1;
  const isCurrentCompleted = currentStepId ? completedStepIds.has(currentStepId) : false;
  const completedCount = countCompletedLearningSteps(navList, completedStepIds);
  const currentNavItem = navList[currentIdx] ?? null;

  // Group nav list by module for sidebar rendering
  const sidebarModules = course.modules;

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 xl:hidden">
        <Link href={`/dashboard/courses/${courseId}`} className="min-h-11 inline-flex items-center text-sm font-semibold text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2">
          ← Курсқа оралу
        </Link>
        <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="learning-outline" className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2">
          {sidebarOpen ? 'Мазмұнды жабу' : 'Курс мазмұны'}
        </button>
      </div>
      <div className="flex min-w-0 flex-col xl:flex-row">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        id="learning-outline"
        aria-label="Курс мазмұны"
        className={`${sidebarOpen ? 'flex' : 'hidden'} max-h-[60vh] w-full flex-shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 xl:flex xl:max-h-[75vh] xl:w-72 xl:border-b-0 xl:border-r`}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="min-w-0 break-words text-sm font-semibold text-gray-800">{course.title}</span>
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Курс мазмұнын жабу" className="workspace-icon-button ml-2 xl:hidden">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 py-2">
          {sidebarModules.map((mod) => (
            <div key={mod.id} className="mb-2">
              <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">
                {mod.order}. {mod.title}
              </div>
              {mod.lessons.map((lesson) => (
                <div key={lesson.id}>
                  <div className="flex items-start gap-1 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
                    <span aria-hidden="true">📖</span><span className="min-w-0 break-words">{lesson.title}</span>
                  </div>
                  {lesson.steps.map((step) => {
                    const done = completedStepIds.has(step.id);
                    const active = step.id === currentStepId;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => navigateToStep(step.id)}
                        aria-current={active ? 'step' : undefined}
                        className={`flex min-h-11 w-full items-center gap-2 px-6 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600 ${
                          active
                            ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-xs" aria-hidden="true">{STEP_ICONS[step.type]}</span>
                        <span className="min-w-0 flex-1 break-words">
                          {step.order}-қадам · {STEP_LABELS[step.type]}
                        </span>
                        {done && <span className="text-green-600 text-xs" aria-label="Аяқталды">✓</span>}
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
      <section aria-label="Сабақ" className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl p-4 sm:p-8">
          {progressError && (
            <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p>Сақталған прогрестің бір бөлігі жүктелмеді. Аяқталған қадамдар саны уақытша толық көрсетілмеуі мүмкін.</p>
              <button type="button" onClick={() => setProgressRetry((attempt) => attempt + 1)} className="min-h-11 rounded-lg border border-amber-300 bg-white px-4 py-2 font-semibold hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
                Қайта жүктеу
              </button>
            </div>
          )}
          {/* Breadcrumb + sidebar toggle */}
          <div className="mb-6 flex min-w-0 items-start gap-3">
            {currentLesson && (
              <nav aria-label="Сабақ жолы" className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-gray-500">
                <Link href={`/dashboard/courses/${courseId}`} className="text-primary-700 hover:underline">{course.title}</Link>
                <span className="text-gray-300">›</span>
                <span>{currentNavItem?.moduleTitle}</span>
                <span className="text-gray-300">›</span>
                <span aria-current="page" className="min-w-0 break-words font-medium text-gray-700">{currentLesson.title}</span>
              </nav>
            )}
          </div>

          {/* Step content */}
          {currentStep ? (
            <div className="space-y-6">
              <div>
                <p className="mb-1 text-sm font-semibold text-primary-700">{STEP_LABELS[currentStep.type]} · {currentStep.order}-қадам</p>
                <h1 ref={contentHeadingRef} tabIndex={-1} className="break-words text-2xl font-bold text-slate-950 outline-none sm:text-3xl">{currentLesson?.title ?? currentNavItem?.lessonTitle}</h1>
              </div>
              <StepContent key={currentStep.id} step={currentStep} onComplete={handleStepComplete} completed={isCurrentCompleted} />
              {currentLesson?.hasAssignment && (
                <Link href={`/dashboard/courses/${courseId}/lessons/${currentLesson.id}`} className="block text-primary-700 underline">
                  Сабақтың жазбаша тапсырмасын орындау →
                </Link>
              )}
              {/* Next step button */}
              {isCurrentCompleted && (
                <div className="pt-4 border-t border-gray-100 flex justify-end">
                  <button type="button"
                    onClick={goToNextStep}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-primary-600 px-6 py-2.5 font-medium text-white transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
                  >
                    {hasNext ? 'Келесі қадам →' : 'Курсқа оралу →'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-3">📚</p>
              <p>{navList.length === 0 ? 'Бұл курста оқу қадамдары әлі жоқ.' : 'Курс мазмұнынан қадамды таңдаңыз.'}</p>
            </div>
          )}

          {/* Progress bar */}
          {navList.length > 0 && !progressError && (
            <div className="mt-8 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>Прогрес</span>
                <span>{completedCount} / {navList.length} қадам</span>
              </div>
              <div role="progressbar" aria-label="Курстың оқу барысы" aria-valuemin={0} aria-valuemax={navList.length} aria-valuenow={completedCount} className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / navList.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
