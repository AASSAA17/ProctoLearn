'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

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
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="card w-full max-w-md space-y-5">
    <h1 className="text-2xl font-bold">Құпиясөзді қалпына келтіру</h1>
    {sent ? <p role="status">Бұл email тіркелген болса, қалпына келтіру сілтемесі жіберіледі. Кіріс хаттар мен спам қалтасын тексеріңіз.</p> : <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-600">Тіркелген email мекенжайыңызды енгізіңіз.</p>
      <div><label htmlFor="reset-email" className="block text-sm font-medium mb-1">Email</label><input id="reset-email" type="email" autoComplete="email" className="input" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={loading} className="btn-primary w-full">{loading ? 'Жіберілуде...' : 'Сілтемені жіберу'}</button>
    </form>}
    <Link className="block text-primary-700" href="/auth/login">Кіру бетіне оралу</Link>
  </section></main>;
}
