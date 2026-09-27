'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { downloadFile } from '@/lib/download';

interface CourseStat {
  id: string; title: string; teacher: { name: string };
  lessonsCount: number; examsCount: number;
  attemptsCount: number; certificatesCount: number; createdAt: string;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/courses/stats').then(r => setCourses(r.data)).finally(() => setLoading(false));
  }, []);

  const downloadExcel = async () => {
    try { await downloadFile('/admin/export/courses', 'курстар.xlsx'); }
    catch { toast.error('Excel файлын жүктеу мүмкін болмады.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:underline">← Артқа</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Курстар статистикасы</h1>
        </div>
        <button onClick={downloadExcel}
          className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg">
          📥 Excel жүктеу
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Жүктелуде...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Курс', 'Мұғалім', 'Сабақтар', 'Емтихандар', 'Талпынулар', 'Сертификаттар', 'Жасалған'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courses.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                    <div className="truncate">{c.title}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.teacher.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">{c.lessonsCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-medium">{c.examsCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-medium">{c.attemptsCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">{c.certificatesCount}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(c.createdAt).toLocaleDateString('kk-KZ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {courses.length === 0 && <p className="text-center py-8 text-gray-400">Курстар жоқ</p>}
        </div>
      )}
    </div>
  );
}
