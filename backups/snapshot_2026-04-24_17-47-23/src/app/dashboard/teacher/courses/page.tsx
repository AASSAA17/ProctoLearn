'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';

interface Course {
  id: string;
  title: string;
  description?: string;
  level: string;
  teacher: { name: string };
  modules?: { id: string; lessons?: { id: string; steps?: { id: string }[] }[] }[];
  _count?: { lessons: number; exams: number };
}

const LEVEL_LABELS: Record<string, { label: string; color: string }> = {
  BEGINNER:     { label: 'Жаңадан бастаушы', color: 'bg-green-100 text-green-800' },
  INTERMEDIATE: { label: 'Орта деңгей',      color: 'bg-yellow-100 text-yellow-800' },
  ADVANCED:     { label: 'Жоғары деңгей',    color: 'bg-red-100 text-red-800' },
};

export default function TeacherCoursesPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const params = user?.id ? `?limit=100&teacherId=${user.id}` : '?limit=100';
      const { data } = await api.get(`/courses${params}`);
      setCourses(data.data ?? data);
    } catch {
      toast.error('Жүктеу қатесі');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCourses(); }, []);

  const handleDelete = async (courseId: string, title: string) => {
    if (!confirm(`"${title}" курсын жою керек пе?`)) return;
    try {
      await api.delete(`/courses/${courseId}`);
      toast.success('Курс жойылды');
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
    } catch {
      toast.error('Жою қатесі');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Менің курстарым</h1>
          <p className="text-gray-500 text-sm mt-1">Курстарды басқару</p>
        </div>
        <Link
          href="/dashboard/teacher/courses/new"
          className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition"
        >
          + Жаңа курс
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((level) => {
          const count = courses.filter((c) => c.level === level).length;
          const info = LEVEL_LABELS[level];
          return (
            <div key={level} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500 mt-1">{info.label}</p>
            </div>
          );
        })}
      </div>

      {/* Course list */}
      {courses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <p className="text-4xl mb-3">📚</p>
          <p className="text-gray-500">Әзірге курстар жоқ</p>
          <Link
            href="/dashboard/teacher/courses/new"
            className="mt-4 inline-block px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Алғашқы курсты жасаңыз
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {courses.map((course) => {
            const level = LEVEL_LABELS[course.level] ?? LEVEL_LABELS.BEGINNER;
            const moduleCount = course.modules?.length ?? 0;
            const stepCount = (course.modules ?? []).reduce(
              (sum, m) => sum + (m.lessons ?? []).reduce((ls, l) => ls + (l.steps?.length ?? 0), 0), 0,
            );
            return (
              <div
                key={course.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${level.color}`}>
                        {level.label}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 text-base truncate">{course.title}</h3>
                    {course.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{course.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-400">
                      <span>📦 {moduleCount} модуль</span>
                      <span>📖 {course._count?.lessons ?? 0} сабақ</span>
                      <span>📝 {stepCount} қадам</span>
                      <span>🎯 {course._count?.exams ?? 0} емтихан</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/dashboard/teacher/courses/${course.id}/edit`}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
                    >
                      ✏️ Өңдеу
                    </Link>
                    <Link
                      href={`/dashboard/courses/${course.id}`}
                      className="px-4 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm hover:bg-primary-100 transition"
                    >
                      👁 Қарау
                    </Link>
                    <button
                      onClick={() => handleDelete(course.id, course.title)}
                      className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm hover:bg-red-100 transition"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
