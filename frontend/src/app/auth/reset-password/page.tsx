'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authMutation } from '@/lib/api';
import { analyzePassword, PASSWORD_HINT } from '@/lib/password-policy';
import { useAuthStore } from '@/store/auth.store';

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="card w-full max-w-md space-y-5">
    <h1 className="text-2xl font-bold">Жаңа құпиясөз</h1>
    {!ready ? <p>Сілтеме тексерілуде...</p> : done ? <p role="status">Құпиясөз жаңартылды. Жаңа құпиясөзбен қайта кіріңіз.</p> : !token ? <p role="alert">Қалпына келтіру сілтемесі жоқ. Email арқылы жаңа сілтеме сұраңыз.</p> : <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-600">{PASSWORD_HINT}</p>
      <div><label htmlFor="new-password" className="block text-sm font-medium mb-1">Жаңа құпиясөз</label><input id="new-password" type="password" autoComplete="new-password" className="input" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      {password && !valid && <p className="text-sm text-amber-800">Құпиясөз жоғарыдағы талаптарға сай болуы керек.</p>}
      <div><label htmlFor="confirm-password" className="block text-sm font-medium mb-1">Құпиясөзді растау</label><input id="confirm-password" type="password" autoComplete="new-password" className="input" required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>
      {confirm && confirm !== password && <p className="text-sm text-red-700">Құпиясөздер сәйкес келмейді.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={loading || !valid || password !== confirm}>{loading ? 'Сақталуда...' : 'Құпиясөзді жаңарту'}</button>
    </form>}
    {!done && ready && <Link className="block text-primary-700" href="/auth/forgot-password">Жаңа сілтеме сұрау</Link>}
    <Link className="block text-primary-700" href="/auth/login">Кіру бетіне оралу</Link>
  </section></main>;
}
