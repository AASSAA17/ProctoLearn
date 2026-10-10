'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import PremiumAuthFrame from '@/components/PremiumAuthFrame';

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {open ? (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </>
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </>
      )}
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      toast.success('Сәтті кірдіңіз!');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Кіру сәтсіз аяқталды');
      toast.error(err.response?.data?.message || 'Кіру сәтсіз аяқталды');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PremiumAuthFrame title="Қайта оралуыңызбен" description="Жеке оқу кеңістігіңізге кіріп, бастаған жолыңызды жалғастырыңыз.">

        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="login-email"
              autoComplete="username"
              type="email"
              className="input min-h-12"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <div className="relative">
              <input
                id="login-password"
                autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                className="input min-h-12 pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Парольді жасыру' : 'Парольді көрсету'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl"
                onClick={() => setShowPassword((v) => !v)}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button type="submit" className="btn-primary min-h-12 w-full" disabled={loading}>
            {loading ? 'Кіру...' : 'Жүйеге кіру'}
          </button>
        </form>

        {process.env.NEXT_PUBLIC_PILOT_MODE === 'true'
          ? <p className="mt-4 text-center text-sm text-slate-600">Құпиясөзді қалпына келтіру үшін пилот әкімшісіне хабарласыңыз.</p>
          : <p className="mt-4 text-center text-sm"><Link href="/auth/forgot-password" className="text-primary-700 hover:underline">Құпиясөзді ұмыттыңыз ба?</Link></p>}

        <p className="text-center text-sm text-gray-500 mt-6">
          Тіркелмедіңіз бе?{' '}
          <Link href="/auth/register" className="text-primary-600 hover:underline font-medium">
            Тіркелу
          </Link>
        </p>
        <p className="text-center mt-4">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg text-xs text-gray-600 hover:text-violet-700 transition-colors">← Басты бетке оралу</Link>
        </p>
    </PremiumAuthFrame>
  );
}
