'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface Lesson {
  id: string;
  title: string;
  order: number;
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
  lessons: Lesson[];
  exams: Exam[];
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api
      .get(`/courses/${id}`)
      .then(({ data }) => setCourse(data))
      .catch(() => {
        toast.error('Курс табылмады');
        router.push('/dashboard/courses');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!course) return null;

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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lessons */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Сабақтар ({course.lessons.length})</h2>
          {course.lessons.length === 0 ? (
            <p className="text-gray-400">Сабақ жоқ</p>
          ) : (
            <ul className="space-y-2">
              {course.lessons.map((lesson) => (
                <li key={lesson.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-primary-600 font-bold text-sm">{lesson.order}</span>
                  <span className="text-gray-800 text-sm">{lesson.title}</span>
                </li>
              ))}
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
                  <Link
                    href={`/dashboard/exam/${exam.id}`}
                    className="mt-2 inline-block btn-primary text-sm px-3 py-1.5"
                  >
                    Емтиханды бастау
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
