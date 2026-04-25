'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface LessonProgress {
  id: string;
  title: string;
  order: number;
  completed: boolean;
}

interface Exam {
  id: string;
  title: string;
  duration: number;
  passScore: number;
}

interface Course {
  id: string;
  title: string;
  description?: string;
  teacher: { name: string };
  lessons: { id: string; title: string; order: number }[];
  modules: {
    id: string;
    title: string;
    order: number;
    lessons: {
      id: string;
      title: string;
      order: number;
      steps: { id: string; type: string; order: number }[];
    }[];
  }[];
  exams: Exam[];
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [stepProgress, setStepProgress] = useState<{ total: number; completed: number; percent: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const [courseRes, progressRes, stepProgressRes] = await Promise.allSettled([
          api.get(`/courses/${id}`),
          api.get(`/courses/${id}/lessons/progress/my`),
          api.get(`/submissions/course/${id}/progress`),
        ]);
        if (courseRes.status === 'fulfilled') setCourse(courseRes.value.data);
        else throw new Error('Course not found');
        if (progressRes.status === 'fulfilled') setProgress(progressRes.value.data);
        if (stepProgressRes.status === 'fulfilled') setStepProgress(stepProgressRes.value.data);
      } catch {
        toast.error('Курс табылмады');
        router.push('/dashboard/courses');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!course) return null;

  const completedIds = new Set(progress.filter((l) => l.completed).map((l) => l.id));
  const allLessonsCompleted = hasCertificate || (course.lessons.length > 0 && course.lessons.every((l) => completedIds.has(l.id)));
  const completedCount = hasCertificate ? course.lessons.length : completedIds.size;
  const hasModules = (course.modules ?? []).length > 0;
  // Total lessons across all modules
  const totalModuleLessons = (course.modules ?? []).reduce((sum, m) => sum + m.lessons.length, 0);
  // First lesson in first module
  const firstModuleLesson = hasModules ? (course.modules[0]?.lessons[0] ?? null) : null;

  // All lessons from modules for progress tracking
  const allModuleLessonIds = (course.modules ?? []).flatMap((m) => m.lessons.map((l) => l.id));
  const moduleLessonsCompleted = hasCertificate ? totalModuleLessons : allModuleLessonIds.filter((id) => completedIds.has(id)).length;
  const allModuleLessonsDone = hasCertificate || (totalModuleLessons > 0 && moduleLessonsCompleted >= totalModuleLessons);

  // A lesson is accessible: if has certificate — all open; order=1 always open; others need prev completed
  const isAccessible = (lesson: { id: string; order: number }) => {
    if (hasCertificate) return true;
    if (lesson.order === 1) return true;
    const prev = course.lessons.find((l) => l.order === lesson.order - 1);
    return prev ? completedIds.has(prev.id) : false;
  };

  // Module lesson accessible: if has certificate — all open; otherwise sequential
  const isModuleLessonAccessible = (modIdx: number, lessonIdx: number): boolean => {
    if (hasCertificate) return true;
    if (modIdx === 0 && lessonIdx === 0) return true;
    const mods = course.modules ?? [];
    let prevId: string | null = null;
    if (lessonIdx > 0) {
      prevId = mods[modIdx]?.lessons[lessonIdx - 1]?.id ?? null;
    } else if (modIdx > 0) {
      const prevMod = mods[modIdx - 1];
      prevId = prevMod?.lessons[prevMod.lessons.length - 1]?.id ?? null;
    }
    return prevId ? completedIds.has(prevId) : false;
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard/courses" className="text-primary-600 hover:underline text-sm">
          ← Курстарға оралу
        </Link>
      </div>

      {/* Certificate / Completion Banner */}
      {hasCertificate && (
        <div className="mb-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="text-5xl">🏆</span>
            <div>
              <p className="text-xl font-bold text-green-800">Курс аяқталды!</p>
              <p className="text-sm text-green-600">Сіз осы курс бойынша сертификат алдыңыз. Барлық сабақтар қол жетімді.</p>
            </div>
          </div>
          <Link
            href="/dashboard/certificates"
            className="whitespace-nowrap bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            🎓 Сертификатты көру
          </Link>
        </div>
      )}

      <div className="card mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{course.title}</h1>
        {course.description && <p className="text-gray-600 mb-4">{course.description}</p>}
        <p className="text-sm text-gray-400">Мұғалім: {course.teacher.name}</p>

        {/* Progress bar — works for both module and flat courses */}
        {(hasModules ? totalModuleLessons : course.lessons.length) > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-500 mb-1">
              <span>Прогресс</span>
              <span>
                {hasModules ? moduleLessonsCompleted : completedCount}/
                {hasModules ? totalModuleLessons : course.lessons.length} сабақ
              </span>
            </div>
            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{
                  width: `${hasModules
                    ? (totalModuleLessons > 0 ? (moduleLessonsCompleted / totalModuleLessons) * 100 : 0)
                    : (course.lessons.length > 0 ? (completedCount / course.lessons.length) * 100 : 0)
                  }%`
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Module-based course content — lessons with direct links */}
      {hasModules && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              Курс бағдарламасы
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({totalModuleLessons} сабақ · {(course.modules ?? []).length} модуль)
              </span>
            </h2>
            {firstModuleLesson && (
              <Link
                href={`/dashboard/courses/${course.id}/lessons/${firstModuleLesson.id}`}
                className="btn-primary text-sm px-4 py-2"
              >
                {moduleLessonsCompleted > 0 ? '▶ Жалғастыру' : '🎓 Оқуды бастау'}
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {(course.modules ?? []).map((mod, modIdx) => {
              const modCompletedCount = mod.lessons.filter((l) => completedIds.has(l.id)).length;
              const modDone = modCompletedCount === mod.lessons.length && mod.lessons.length > 0;
              return (
                <details key={mod.id} className="bg-gray-50 rounded-xl border border-gray-100" open={modIdx === 0}>
                  <summary className="px-4 py-3 cursor-pointer font-medium text-gray-800 flex items-center gap-2 select-none">
                    <span>{modDone ? '✅' : '📦'}</span>
                    <span>{mod.order}. {mod.title}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {modCompletedCount}/{mod.lessons.length} сабақ
                    </span>
                  </summary>
                  <div className="px-4 pb-3 space-y-1.5">
                    {mod.lessons.map((lesson, lessonIdx) => {
                      const done = completedIds.has(lesson.id);
                      const accessible = isModuleLessonAccessible(modIdx, lessonIdx);
                      const isTest = lesson.title.toLowerCase().includes('тест') ||
                                     lesson.title.toLowerCase().includes('test') ||
                                     lesson.title.toLowerCase().includes('модуль тест') ||
                                     (lessonIdx + 1) % 5 === 0;
                      if (!accessible) {
                        return (
                          <div key={lesson.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 opacity-50 cursor-not-allowed">
                            <span className="w-6 h-6 flex-shrink-0 rounded-full border-2 border-gray-200 flex items-center justify-center text-xs">🔒</span>
                            <span className="truncate">{lesson.title}</span>
                          </div>
                        );
                      }
                      return (
                        <Link
                          key={lesson.id}
                          href={`/dashboard/courses/${course.id}/lessons/${lesson.id}`}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            done
                              ? 'bg-green-50 border border-green-200 text-green-800 hover:bg-green-100'
                              : isTest
                              ? 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
                              : 'bg-white border border-gray-200 text-gray-700 hover:border-primary-300 hover:text-primary-700'
                          }`}
                        >
                          <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                            done ? 'bg-green-500 text-white' : isTest ? 'bg-amber-400 text-white' : 'bg-primary-100 text-primary-700'
                          }`}>
                            {done ? '✓' : isTest ? '🧪' : lesson.order}
                          </span>
                          <span className="truncate flex-1">{lesson.title}</span>
                          {isTest && !done && <span className="text-xs text-amber-600 flex-shrink-0">Мини-тест</span>}
                          {done && <span className="text-xs text-green-600 flex-shrink-0">✓ Орындалды</span>}
                          {!done && !isTest && <span className="text-xs text-primary-500 flex-shrink-0">→</span>}
                        </Link>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {/* All lessons done → take exam banner */}
      {((hasModules && allModuleLessonsDone) || (!hasModules && allLessonsCompleted)) && course.exams.length > 0 && (
        <div className="mb-6 p-5 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎉</span>
            <div>
              <p className="font-semibold text-green-800">Барлық сабақтарды аяқтадыңыз!</p>
              <p className="text-sm text-green-600">Енді емтиханды тапсыра аласыз</p>
            </div>
          </div>
          <Link href={`/dashboard/exam/${course.exams[0].id}`} className="btn-primary whitespace-nowrap">
            Емтиханды бастау →
          </Link>
        </div>
      )}

      <div className={`grid grid-cols-1 ${!hasModules ? 'md:grid-cols-2' : ''} gap-6`}>
        {/* Flat lessons — only shown for non-module courses */}
        {!hasModules && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Сабақтар ({course.lessons.length})</h2>
          {course.lessons.length === 0 ? (
            <p className="text-gray-400">Сабақ жоқ</p>
          ) : (
            <ul className="space-y-2">
              {course.lessons.map((lesson) => {
                const done = completedIds.has(lesson.id);
                const accessible = isAccessible(lesson);
                return (
                  <li key={lesson.id}>
                    {accessible ? (
                      <Link
                        href={`/dashboard/courses/${course.id}/lessons/${lesson.id}`}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          done
                            ? 'bg-green-50 border-green-200 hover:bg-green-100'
                            : 'bg-gray-50 border-transparent hover:bg-primary-50 hover:border-primary-200'
                        }`}
                      >
                        <span className={`w-7 h-7 flex-shrink-0 rounded-full text-sm font-bold flex items-center justify-center ${
                          done ? 'bg-green-500 text-white' : 'bg-primary-100 text-primary-700'
                        }`}>
                          {done ? '✓' : lesson.order}
                        </span>
                        <span className={`text-sm font-medium ${done ? 'text-green-800' : 'text-gray-800'}`}>
                          {lesson.title}
                        </span>
                        <span className="ml-auto text-xs text-primary-600">
                          {done ? '✓ Оқылды' : 'Оқу →'}
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-transparent bg-gray-50 opacity-50 cursor-not-allowed">
                        <span className="w-7 h-7 flex-shrink-0 rounded-full bg-gray-200 text-gray-500 text-sm font-bold flex items-center justify-center">
                          🔒
                        </span>
                        <span className="text-sm font-medium text-gray-500">{lesson.title}</span>
                        <span className="ml-auto text-xs text-gray-400">Жабық</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}

        {/* Exams */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Емтихандар ({course.exams.length})</h2>
          {course.exams.length === 0 ? (
            <p className="text-gray-400">Емтихан жоқ</p>
          ) : (
            <ul className="space-y-3">
              {course.exams.map((exam) => {
                const canTakeExam = hasModules
                  ? allModuleLessonsDone
                  : allLessonsCompleted;
                return (
                  <li key={exam.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-800">{exam.title}</p>
                    <div className="flex gap-4 text-xs text-gray-500 mt-1">
                      <span>⏱ {exam.duration} мин</span>
                      <span>✓ Өту балы: {exam.passScore}%</span>
                    </div>
                    {canTakeExam ? (
                      <Link
                        href={`/dashboard/exam/${exam.id}`}
                        className="mt-2 inline-block btn-primary text-sm px-3 py-1.5"
                      >
                        Емтиханды бастау
                      </Link>
                    ) : (
                      <div className="mt-2">
                        <span className="inline-block text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">
                          🔒 {hasModules ? 'Барлық қадамдарды аяқтаңыз' : 'Барлық сабақтарды аяқтаңыз'}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
