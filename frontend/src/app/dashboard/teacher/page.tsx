'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';

interface Course {
  id: string;
  title: string;
  description?: string;
  _count: { lessons: number; exams: number };
}

export default function TeacherDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });

  useEffect(() => {
    api
      .get('/courses')
      .then(({ data }) => setCourses(data))
      .catch(() => toast.error('Жүктеу қатесі'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/courses', form);
      setCourses((prev) => [...prev, data]);
      setForm({ title: '', description: '' });
      toast.success('Курс жасалды!');
    } catch {
      toast.error('Курс жасау қатесі');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Курсты жоюды растайсыз ба?')) return;
    try {
      await api.delete(`/courses/${id}`);
      setCourses((prev) => prev.filter((c) => c.id !== id));
      toast.success('Курс жойылды');
    } catch {
      toast.error('Жою қатесі');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Мұғалім панелі</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create course form */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Жаңа курс жасау</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Атауы</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Курс атауы..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Сипаттама</label>
              <textarea
                className="input resize-none"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Курс туралы..."
                rows={3}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={creating}>
              {creating ? 'Жасалуда...' : '+ Курс жасау'}
            </button>
          </form>
        </div>

        {/* Courses list */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold mb-4">Менің курстарым</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : courses.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Курс жоқ</p>
          ) : (
            <div className="space-y-3">
              {courses.map((course) => (
                <div key={course.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-gray-900">{course.title}</h3>
                      {course.description && (
                        <p className="text-sm text-gray-500 mt-1">{course.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-gray-400">
                        <span>{course._count?.lessons ?? 0} сабақ</span>
                        <span>{course._count?.exams ?? 0} емтихан</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(course.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Жою
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
