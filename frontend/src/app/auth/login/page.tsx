'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Сәтті кірдіңіз!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Кіру сәтсіз аяқталды');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">ProctoLearn</h1>
          <p className="text-gray-500 mt-2">Жүйеге кіру</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Кіру...' : 'Жүйеге кіру'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Тіркелмедіңіз бе?{' '}
          <Link href="/auth/register" className="text-primary-600 hover:underline">
            Тіркелу
          </Link>
        </p>
      </div>
    </div>
  );
}
