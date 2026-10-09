'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import PremiumAuthFrame from '@/components/PremiumAuthFrame';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError('');
    try { await api.post('/auth/forgot-password', { email }); setSent(true); }
    catch (failure: any) {
      setError(failure.response?.status === 429 ? 'Сұрау саны шектелді. Кейінірек қайталап көріңіз.' : 'Сұрауды жіберу мүмкін болмады. Байланысты тексеріп, қайта көріңіз.');
    } finally { setLoading(false); }
  };
  return <PremiumAuthFrame title="Құпиясөзді ұмыттыңыз ба?" description="Тіркелгіңізге қайта кіру үшін email арқылы қалпына келтіру сілтемесін сұраңыз."><div className="space-y-5">
    {sent ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-relaxed text-emerald-900"><span aria-hidden="true" className="mb-3 grid size-10 place-items-center rounded-full bg-emerald-100 text-xl">✓</span>Бұл email тіркелген болса, қалпына келтіру сілтемесі жіберіледі. Кіріс хаттар мен спам қалтасын тексеріңіз.</div> : <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
      <p className="text-sm text-gray-600">Тіркелген email мекенжайыңызды енгізіңіз.</p>
      <div><label htmlFor="reset-email" className="block text-sm font-medium mb-2">Email</label><input id="reset-email" type="email" autoComplete="email" placeholder="email@example.com" className="input min-h-12" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button disabled={loading} className="btn-primary min-h-12 w-full">{loading ? 'Жіберілуде...' : 'Сілтемені жіберу'}</button>
    </form>}
    <Link className="flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-violet-700 hover:bg-violet-50" href="/auth/login">← Кіру бетіне оралу</Link>
  </div></PremiumAuthFrame>;
}
