'use client';

import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const cards = [
    {
      title: 'Курстар',
      description: 'Барлық қолжетімді курстарды қараңыз',
      href: '/dashboard/courses',
      icon: '📚',
      color: 'bg-blue-50 border-blue-200',
    },
    {
      title: 'Менің нәтижелерім',
      description: 'Өткен емтихандар мен нәтижелер',
      href: '/dashboard/my-attempts',
      icon: '📊',
      color: 'bg-green-50 border-green-200',
    },
    {
      title: 'Сертификаттар',
      description: 'Алған сертификаттарыңыз',
      href: '/dashboard/certificates',
      icon: '🏆',
      color: 'bg-yellow-50 border-yellow-200',
    },
  ];

  if (user?.role === 'TEACHER' || user?.role === 'ADMIN') {
    cards.push({
      title: 'Мұғалім панелі',
      description: 'Курс және емтихан басқаруы',
      href: '/dashboard/teacher',
      icon: '🎓',
      color: 'bg-purple-50 border-purple-200',
    });
  }

  if (user?.role === 'PROCTOR' || user?.role === 'ADMIN') {
    cards.push({
      title: 'Проктор панелі',
      description: 'Емтихан сессияларын бақылау',
      href: '/dashboard/proctor',
      icon: '🔍',
      color: 'bg-red-50 border-red-200',
    });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Қош келдіңіз, {user?.name}!
        </h1>
        <p className="text-gray-500 mt-1">ProctoLearn — онлайн оқыту платформасы</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`card border-2 ${card.color} hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start gap-4">
              <span className="text-4xl">{card.icon}</span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{card.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
