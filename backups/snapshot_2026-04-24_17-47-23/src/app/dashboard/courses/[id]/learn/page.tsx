'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import DOMPurify from 'dompurify';
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

// ─── Video Step ───────────────────────────────────────────────────────────────
function VideoStep({ content, onComplete }: { content: Record<string, any>; onComplete: () => void }) {
  return (
    <div className="space-y-4">
      <div className="aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          src={content.videoUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {content.description && (
        <p className="text-gray-600 text-sm">{content.description}</p>
      )}
      <button
        onClick={onComplete}
        className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
      >
        ✅ Бейнені қарадым
      </button>
    </div>
  );
}

// ─── Text Step ────────────────────────────────────────────────────────────────
function TextStep({ content, onComplete }: { content: Record<string, any>; onComplete: () => void }) {
  return (
    <div className="space-y-4">
      <div
        className="prose max-w-none bg-white rounded-xl p-6 border border-gray-100 shadow-sm"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content.html ?? '', { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target'] }) }}
      />
      <button
        onClick={onComplete}
        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
      >
        ✅ Оқыдым
      </button>
    </div>
  );
}

// ─── Task Step ────────────────────────────────────────────────────────────────
function TaskStep({
  stepId,
  content,
  onComplete,
}: {
  stepId: string;
  content: Record<string, any>;
  onComplete: () => void;
}) {
  const [selected, setSelected] = useState<string | string[]>('');
  const [textInput, setTextInput] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [result, setResult] = useState<{ isCorrect: boolean; score: number; explanation?: string; correctAnswer?: any } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    let answer: Record<string, any> = {};
    if (content.taskType === 'single_choice') answer = { selected };
    else if (content.taskType === 'multiple_choice') answer = { selected };
    else if (content.taskType === 'text_input') answer = { text: textInput };
    else if (content.taskType === 'number_input') answer = { value: numberInput };

    setSubmitting(true);
    try {
      const { data } = await api.post(`/steps/${stepId}/submit`, { answer });
      setResult(data);
      if (data.isCorrect) onComplete();
    } catch {
      toast.error('Жіберу қатесі');
    } finally {
      setSubmitting(false);
    }
  };

  const resetTask = () => {
    setResult(null);
    setSelected('');
    setTextInput('');
    setNumberInput('');
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-5">
      <p className="text-lg font-semibold text-gray-800">{content.question}</p>

      {/* Single choice */}
      {content.taskType === 'single_choice' && (
        <div className="space-y-2">
          {(content.options ?? []).map((opt: string) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selected === opt
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-primary-300'
              }`}
            >
              <input
                type="radio"
                name="single"
                value={opt}
                checked={selected === opt}
                onChange={() => setSelected(opt)}
                disabled={!!result}
                className="accent-primary-600"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {/* Multiple choice */}
      {content.taskType === 'multiple_choice' && (
        <div className="space-y-2">
          {(content.options ?? []).map((opt: string) => {
            const arr = Array.isArray(selected) ? selected : [];
            const checked = arr.includes(opt);
            return (
              <label
                key={opt}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  checked ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const a = Array.isArray(selected) ? [...selected] : [];
                    setSelected(checked ? a.filter((x) => x !== opt) : [...a, opt]);
                  }}
                  disabled={!!result}
                  className="accent-primary-600"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Text input */}
      {content.taskType === 'text_input' && (
        <input
          type="text"
          value={textInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextInput(e.target.value)}
          disabled={!!result}
          placeholder="Жауапты енгізіңіз..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}

      {/* Number input */}
      {content.taskType === 'number_input' && (
        <input
          type="number"
          value={numberInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumberInput(e.target.value)}
          disabled={!!result}
          placeholder="Санды енгізіңіз..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}

      {/* Submit */}
      {!result && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Тексерілуде...' : 'Жауапты жіберу'}
        </button>
      )}

      {/* Result */}
      {result && (
        <div
          className={`rounded-xl p-4 border ${
            result.isCorrect
              ? 'bg-green-50 border-green-300 text-green-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
        >
          <p className="font-bold text-base mb-1">
            {result.isCorrect ? '✅ Дұрыс!' : '❌ Қате'}
          </p>
          {!result.isCorrect && result.correctAnswer && (
            <p className="text-sm">Дұрыс жауап: <strong>{result.correctAnswer}</strong></p>
          )}
          {result.explanation && (
            <p className="text-sm mt-1 text-gray-700">{result.explanation}</p>
          )}
          {!result.isCorrect && (
            <button
              onClick={resetTask}
              className="mt-3 px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
            >
              Қайталау
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Learn Page ──────────────────────────────────────────────────────────
export default function LearnPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStepId = searchParams.get('step');

  const [course, setCourse] = useState<Course | null>(null);
  const [navList, setNavList] = useState<NavItem[]>([]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(initialStepId);
  const [currentStep, setCurrentStep] = useState<Step | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load course structure
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/courses/${courseId}`);
        const courseData: Course = data;
        setCourse(courseData);
        const list = buildNavList(courseData.modules ?? []);
        setNavList(list);

        // Load progress
        const progressRes = await api.get(`/submissions/course/${courseId}/progress`).catch(() => ({ data: null }));
        if (progressRes.data) {
          // Load per-step completion in parallel (avoids sequential N+1 calls)
          const allLessons = (courseData.modules ?? []).flatMap((m: CourseModule) => m.lessons);
          const completedIds = new Set<string>();
          const progressResults = await Promise.all(
            allLessons.map((lesson: Lesson) =>
              api.get(`/submissions/lesson/${lesson.id}/progress`).catch(() => ({ data: [] }))
            )
          );
          progressResults.forEach((res: any) => {
            (res.data ?? []).forEach((s: any) => {
              if (s.completed) completedIds.add(s.id);
            });
          });
          setCompletedStepIds(completedIds);
        }

        // Pick initial step
        const firstStepId = initialStepId ?? list[0]?.stepId ?? null;
        if (firstStepId) navigateToStep(firstStepId, courseData);
      } catch {
        toast.error('Курс жүктеу қатесі');
        router.push(`/dashboard/courses/${courseId}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseId]);

  const navigateToStep = useCallback(
    (stepId: string, courseData?: Course) => {
      const c = courseData ?? course;
      if (!c) return;
      for (const mod of c.modules) {
        for (const lesson of mod.lessons) {
          const step = lesson.steps.find((s) => s.id === stepId);
          if (step) {
            setCurrentStepId(stepId);
            setCurrentStep(step);
            setCurrentLesson(lesson);
            return;
          }
        }
      }
    },
    [course],
  );

  const handleStepComplete = useCallback(() => {
    if (!currentStepId) return;
    setCompletedStepIds((prev) => new Set([...prev, currentStepId]));
    toast.success('Қадам аяқталды! 🎉');
  }, [currentStepId]);

  const goToNextStep = useCallback(() => {
    const idx = navList.findIndex((n) => n.stepId === currentStepId);
    if (idx < navList.length - 1) {
      navigateToStep(navList[idx + 1].stepId);
    } else {
      toast.success('🏆 Барлық қадамдар аяқталды!');
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
  if (!course) return null;

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

          {/* Step content */}
          {currentStep ? (
            <div className="space-y-6">
              {currentStep.type === 'VIDEO' && (
                <VideoStep
                  content={currentStep.content}
                  onComplete={handleStepComplete}
                />
              )}
              {currentStep.type === 'TEXT' && (
                <TextStep
                  content={currentStep.content}
                  onComplete={handleStepComplete}
                />
              )}
              {currentStep.type === 'TASK' && (
                <TaskStep
                  stepId={currentStep.id}
                  content={currentStep.content}
                  onComplete={handleStepComplete}
                />
              )}

              {/* Next step button */}
              {(isCurrentCompleted || currentStep.type !== 'TASK') && (
                <div className="pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={goToNextStep}
                    className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition flex items-center gap-2"
                  >
                    {hasNext ? 'Келесі қадам →' : '🏆 Курсты аяқтау'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-3">📚</p>
              <p>Сол жақтан қадамды таңдаңыз</p>
            </div>
          )}

          {/* Progress bar */}
          {navList.length > 0 && (
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
