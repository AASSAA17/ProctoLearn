'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';

const LEVELS = [
  { value: 'BEGINNER',     label: 'Жаңадан бастаушы' },
  { value: 'INTERMEDIATE', label: 'Орта деңгей' },
  { value: 'ADVANCED',     label: 'Жоғары деңгей' },
];

export default function NewCoursePage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', description: '', level: 'BEGINNER' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Атауды енгізіңіз'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post('/courses', form);
      toast.success('Курс жасалды!');
      router.push(`/dashboard/teacher/courses/${data.id}/edit`);
    } catch {
      toast.error('Жасау қатесі');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/dashboard/teacher/courses" className="hover:text-primary-600">Курстар</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Жаңа курс</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Жаңа курс жасау</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Курс атауы <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="мысалы: JavaScript негіздері"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Сипаттама</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={4}
              placeholder="Курс туралы қысқаша сипаттама..."
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Деңгей</label>
            <select
              value={form.level}
              onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Жасалуда...' : 'Курс жасау →'}
            </button>
            <Link
              href="/dashboard/teacher/courses"
              className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition text-center"
            >
              Болдырмау
            </Link>
          </div>
        </form>
      </div>

      <p className="text-center text-sm text-gray-400 mt-4">
        Курс жасалғаннан кейін бөлімдер мен сабақтарды қосуға болады
      </p>
    </div>
  );
}
