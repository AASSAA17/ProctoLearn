'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Course {
  id: string;
  title: string;
  description?: string;
  teacher: { name: string };
  _count: { lessons: number; exams: number };
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/courses')
      .then(({ data }) => setCourses(data))
      .catch(() => toast.error('Курстарды жүктеу қатесі'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Курстар</h1>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">Курс табылмады</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Link key={course.id} href={`/dashboard/courses/${course.id}`}>
              <div className="card hover:shadow-md transition-shadow cursor-pointer h-full">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{course.title}</h3>
                {course.description && (
                  <p className="text-gray-500 text-sm mb-4 line-clamp-2">{course.description}</p>
                )}
                <div className="flex items-center justify-between mt-auto text-xs text-gray-400">
                  <span>Мұғалім: {course.teacher.name}</span>
                  <div className="flex gap-3">
                    <span>{course._count.lessons} сабақ</span>
                    <span>{course._count.exams} емтихан</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
