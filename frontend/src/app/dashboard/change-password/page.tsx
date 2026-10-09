'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { authMutation } from '@/lib/api';
import toast from 'react-hot-toast';
import { analyzePassword } from '@/lib/password-policy';



const STRENGTH_LABELS = ['', 'Әлсіз', 'Орташа', 'Күшті'];
const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-yellow-400', 'bg-green-500'];
const STRENGTH_TEXT = ['', 'text-red-600', 'text-yellow-600', 'text-green-600'];

export default function ChangePasswordPage() {
  const { user, setUser } = useAuthStore();
  const router = useRouter();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  const pwA = analyzePassword(form.newPassword);
  const mismatch = !!form.confirmPassword && form.newPassword !== form.confirmPassword;
  const isValid = pwA.valid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { toast.error('Құпиясөз талаптарға сай емес'); return; }
    if (mismatch) { toast.error('Құпиясөздер сәйкес келмейді'); return; }
    setLoading(true);
    try {
      await authMutation('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }, true);
      setUser(null);
      toast.success('Құпиясөз өзгертілді. Жаңа құпиясөзбен қайта кіріңіз.');
      router.replace('/auth/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Құпиясөз өзгерту қатесі');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-8">
        <p className="workspace-eyebrow">Аккаунт қауіпсіздігі</p>
        <h1 className="text-xl font-bold text-gray-900 mb-6">Құпиясөзді өзгерту</h1>
        {user && (user as any).mustChangePassword && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
            ⚠️ Администратор құпиясөзді жаңалады. Кіруден бұрын жаңа құпиясөз орнатуыңыз керек.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">Ағымдағы құпиясөз</label>
            <input id="current-password" type="password" autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.currentPassword}
              onChange={e => setForm(p => ({ ...p, currentPassword: e.target.value }))}
              required />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">Жаңа құпиясөз</label>
            <input id="new-password" type="password" autoComplete="new-password" aria-describedby="password-requirements"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.newPassword}
              onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))}
              required />
            {form.newPassword.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1,2,3].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${pwA.score >= i ? STRENGTH_COLORS[i] : 'bg-gray-200'}`} />
                  ))}
                </div>
                <p className={`text-xs ${STRENGTH_TEXT[pwA.score]}`}>{STRENGTH_LABELS[pwA.score]}</p>
              </div>
            )}
            <div id="password-requirements" className="mt-1 space-y-0.5">
              {[
                { ok: pwA.checks.bytes, l: 'Ең көбі 72 UTF-8 байт' },
                { ok: pwA.checks.length, l: 'Кемінде 6 символ' },
                { ok: pwA.checks.digits, l: `Кемінде 2 сан (қазір: ${pwA.digits})` },
                { ok: pwA.checks.specials, l: `Кемінде 2 арнайы таңба (қазір: ${pwA.specials})` },
              ].map(({ ok, l }) => (
                <p key={l} className={`text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>{ok ? '✓' : '○'} {l}</p>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Құпиясөзді растау</label>
            <input id="confirm-password" type="password" autoComplete="new-password" aria-invalid={mismatch} aria-describedby={mismatch ? 'password-mismatch' : undefined}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${mismatch ? 'border-red-400' : 'border-gray-300'}`}
              value={form.confirmPassword}
              onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
              required />
            {mismatch && <p id="password-mismatch" role="alert" className="text-xs text-red-700 mt-1">Құпиясөздер сәйкес келмейді</p>}
          </div>
          <button type="submit" disabled={loading || !isValid || mismatch}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {loading ? 'Сақталуда...' : 'Құпиясөзді өзгерту'}
          </button>
        </form>
      </div>
    </div>
  );
}
