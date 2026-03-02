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
  exams: Exam[];
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const [courseRes, progressRes] = await Promise.all([
          api.get(`/courses/${id}`),
          api.get(`/courses/${id}/lessons/progress/my`),
        ]);
        setCourse(courseRes.data);
        setProgress(progressRes.data);
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
  const allLessonsCompleted = course.lessons.length > 0 && course.lessons.every((l) => completedIds.has(l.id));
  const completedCount = completedIds.size;

  // A lesson is accessible if it's first OR the previous lesson is completed
  const isAccessible = (lesson: { id: string; order: number }) => {
    if (lesson.order === 1) return true;
    const prev = course.lessons.find((l) => l.order === lesson.order - 1);
    return prev ? completedIds.has(prev.id) : false;
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard/courses" className="text-primary-600 hover:underline text-sm">
          ← Курстарға оралу
        </Link>
      </div>

      <div className="card mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{course.title}</h1>
        {course.description && <p className="text-gray-600 mb-4">{course.description}</p>}
        <p className="text-sm text-gray-400">Мұғалім: {course.teacher.name}</p>

        {/* Progress bar */}
        {course.lessons.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-500 mb-1">
              <span>Прогресс</span>
              <span>{completedCount}/{course.lessons.length} сабақ</span>
            </div>
            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / course.lessons.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* All lessons done → take exam banner */}
      {allLessonsCompleted && course.exams.length > 0 && (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lessons */}
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

        {/* Exams */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Емтихандар ({course.exams.length})</h2>
          {course.exams.length === 0 ? (
            <p className="text-gray-400">Емтихан жоқ</p>
          ) : (
            <ul className="space-y-3">
              {course.exams.map((exam) => (
                <li key={exam.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-800">{exam.title}</p>
                  <div className="flex gap-4 text-xs text-gray-500 mt-1">
                    <span>⏱ {exam.duration} мин</span>
                    <span>✓ Өту балы: {exam.passScore}%</span>
                  </div>
                  {allLessonsCompleted ? (
                    <Link
                      href={`/dashboard/exam/${exam.id}`}
                      className="mt-2 inline-block btn-primary text-sm px-3 py-1.5"
                    >
                      Емтиханды бастау
                    </Link>
                  ) : (
                    <div className="mt-2">
                      <span className="inline-block text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">
                        🔒 Барлық сабақтарды аяқтаңыз
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
