'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

function analyzePassword(pw: string) {
  const digits = (pw.match(/\d/g) || []).length;
  const specials = (pw.match(/[!@#$%^&*()\-_=+\[\]{};':"|,.<>\/?]/g) || []).length;
  const checks = { length: pw.length >= 6, digits: digits >= 2, specials: specials >= 2 };
  const score = Object.values(checks).filter(Boolean).length;
  return { checks, score, digits, specials };
}

const STRENGTH_LABELS = ['', 'Alsiz', 'Ortasha', 'Kushti'];
const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-yellow-400', 'bg-green-500'];
const STRENGTH_TEXT = ['', 'text-red-600', 'text-yellow-600', 'text-green-600'];

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', phoneDigits: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const register = useAuthStore((s: any) => s.register);
  const router = useRouter();

  const pwA = analyzePassword(form.password);
  const passwordMismatch = !!form.confirmPassword && form.password !== form.confirmPassword;
  const phone = form.phoneDigits ? '+7' + form.phoneDigits : '';
  const isPasswordValid = pwA.checks.length && pwA.checks.digits && pwA.checks.specials;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 10);
    setForm((prev) => ({ ...prev, phoneDigits: d }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Parolder saykес kelmeydi'); return; }
    if (!isPasswordValid) { toast.error('Parol talaptatyna say emes'); return; }
    if (form.phoneDigits && form.phoneDigits.length !== 10) { toast.error('Telefon nomiri tolyk emes'); return; }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, phone || undefined);
      toast.success('Tirkelу satty!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Tirkelу katesi oryn aldy');
    } finally {
      setLoading(false);
    }
  };

  const ic = (err?: boolean) =>
    `w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${err ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-1 mb-4">
            <span className="text-2xl font-extrabold text-primary-700">Procto</span>
            <span className="text-2xl font-extrabold text-gray-800">Learn</span>
          </Link>
          <p className="text-gray-500 text-sm">Жаңа тіркелгі жасау</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aty-zhoni <span className="text-red-500">*</span></label>
            <input name="name" type="text" className={ic()} value={form.name} onChange={handleChange} placeholder="Tolyk atyngyz" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input name="email" type="email" className={ic()} value={form.email} onChange={handleChange} placeholder="email@example.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon nomiri</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 rounded-l-lg bg-gray-100 text-gray-700 font-mono font-semibold text-sm select-none">+7</span>
              <input type="tel" inputMode="numeric"
                className={`flex-1 border rounded-r-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${form.phoneDigits && form.phoneDigits.length !== 10 ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                value={form.phoneDigits} onChange={handlePhone} placeholder="7001234567" maxLength={10} />
            </div>
            {form.phoneDigits.length > 0 && form.phoneDigits.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Tagy {10 - form.phoneDigits.length} tsifrdi engizingiz</p>
            )}
            {form.phoneDigits.length === 10 && <p className="text-xs text-green-600 mt-1">OK: {phone}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parol <span className="text-red-500">*</span></label>
            <div className="relative">
              <input name="password" type={showPassword ? 'text' : 'password'}
                className={`w-full border rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 ${form.password && !isPasswordValid ? 'border-red-300' : 'border-gray-300'}`}
                value={form.password} onChange={handleChange} placeholder="Parol" required />
              <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowPassword(v => !v)}><EyeIcon open={showPassword} /></button>
            </div>
            {form.password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${pwA.score >= i ? STRENGTH_COLORS[i] : 'bg-gray-200'}`} />
                  ))}
                </div>
                <p className={`text-xs font-medium ${STRENGTH_TEXT[pwA.score]}`}>{STRENGTH_LABELS[pwA.score]}</p>
              </div>
            )}
            <div className="mt-2 space-y-1">
              {[
                { ok: pwA.checks.length, label: 'Keminde 6 symbol' },
                { ok: pwA.checks.digits, label: `Keminde 2 tsirf (kazir: ${pwA.digits})` },
                { ok: pwA.checks.specials, label: `Keminde 2 arnayy tanha (kazir: ${pwA.specials})` },
              ].map(({ ok, label }) => (
                <p key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-green-600' : 'text-gray-400'}`}>
                  <span>{ok ? '+' : 'o'}</span> {label}
                </p>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paroldi rastau <span className="text-red-500">*</span></label>
            <div className="relative">
              <input name="confirmPassword" type={showConfirm ? 'text' : 'password'} className={ic(passwordMismatch)}
                value={form.confirmPassword} onChange={handleChange} placeholder="Parol" required />
              <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowConfirm(v => !v)}><EyeIcon open={showConfirm} /></button>
            </div>
            {passwordMismatch && <p className="text-xs text-red-500 mt-1">Parolder saykеs kelmeydi</p>}
            {form.confirmPassword && !passwordMismatch && <p className="text-xs text-green-600 mt-1">OK: Parolder saykеs</p>}
          </div>
          <button type="submit"
            disabled={loading || !isPasswordValid || passwordMismatch || (form.phoneDigits.length > 0 && form.phoneDigits.length !== 10)}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {loading ? 'Tirkelуde...' : 'Tirkelу'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Тіркелгіңіз бар ма?{' '}
          <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">Кіру</Link>
        </p>
        <p className="text-center mt-4">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Басты бетке оралу</Link>
        </p>
      </div>
    </div>
  );
}
