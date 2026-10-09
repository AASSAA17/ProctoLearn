'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authMutation } from '@/lib/api';
import { analyzePassword, PASSWORD_HINT } from '@/lib/password-policy';
import { useAuthStore } from '@/store/auth.store';
import PremiumAuthFrame from '@/components/PremiumAuthFrame';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token');
    setToken((previous) => value || previous);
    window.history.replaceState(window.history.state, '', window.location.pathname);
    setReady(true);
  }, []);
  const valid = analyzePassword(password).valid;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !token || !valid || password !== confirm) return;
    setLoading(true); setError('');
    try {
      await authMutation('/auth/reset-password', { token, newPassword: password });
      useAuthStore.getState().setUser(null);
      setDone(true); setToken(null); setPassword(''); setConfirm('');
    } catch (failure: any) {
      setError([400, 401, 410].includes(failure.response?.status) ? 'Сілтеме жарамсыз немесе мерзімі өткен. Жаңа сілтеме сұраңыз.' : 'Құпиясөз өзгергені расталмады. Байланысты тексеріп, қайта көріңіз.');
    } finally { setLoading(false); }
  };
  return <PremiumAuthFrame title="Жаңа құпиясөз" description="Тіркелгіңіз үшін жаңа құпиясөз орнатыңыз."><div className="space-y-5">
    {!ready ? <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Сілтеме тексерілуде...</p> : done ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">✓ Құпиясөз жаңартылды. Жаңа құпиясөзбен қайта кіріңіз.</p> : !token ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Қалпына келтіру сілтемесі жоқ. Email арқылы жаңа сілтеме сұраңыз.</p> : <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
      <p id="reset-policy" className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-gray-600">{PASSWORD_HINT}</p>
      <div><label htmlFor="new-password" className="block text-sm font-medium mb-2">Жаңа құпиясөз</label><div className="relative"><input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" aria-describedby="reset-policy reset-policy-error" aria-invalid={!!password && !valid} className="input min-h-12 pr-12" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Құпиясөзді жасыру' : 'Құпиясөзді көрсету'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 grid min-w-11 place-items-center rounded-r-xl text-slate-500">{showPassword ? <EyeSlashIcon className="size-5" aria-hidden="true" /> : <EyeIcon className="size-5" aria-hidden="true" />}</button></div></div>
      <div id="reset-policy-error" aria-live="polite">{password && !valid && <p className="text-sm text-amber-800">Құпиясөз жоғарыдағы талаптарға сай болуы керек.</p>}</div>
      <div><label htmlFor="confirm-password" className="block text-sm font-medium mb-2">Құпиясөзді растау</label><div className="relative"><input id="confirm-password" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" aria-describedby="reset-match-error" aria-invalid={!!confirm && confirm !== password} className="input min-h-12 pr-12" required value={confirm} onChange={(event) => setConfirm(event.target.value)} /><button type="button" aria-label={showConfirm ? 'Растау құпиясөзін жасыру' : 'Растау құпиясөзін көрсету'} aria-pressed={showConfirm} onClick={() => setShowConfirm(value => !value)} className="absolute inset-y-0 right-0 grid min-w-11 place-items-center rounded-r-xl text-slate-500">{showConfirm ? <EyeSlashIcon className="size-5" aria-hidden="true" /> : <EyeIcon className="size-5" aria-hidden="true" />}</button></div></div>
      <div id="reset-match-error" aria-live="polite">{confirm && confirm !== password && <p className="text-sm text-red-700">Құпиясөздер сәйкес келмейді.</p>}</div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button className="btn-primary min-h-12 w-full" disabled={loading || !valid || password !== confirm}>{loading ? 'Сақталуда...' : 'Құпиясөзді жаңарту'}</button>
    </form>}
    {!done && ready && <Link className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50" href="/auth/forgot-password">Жаңа сілтеме сұрау</Link>}
    <Link className="flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-violet-700 hover:bg-violet-50" href="/auth/login">← Кіру бетіне оралу</Link>
  </div></PremiumAuthFrame>;
}
