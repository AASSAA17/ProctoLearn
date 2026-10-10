'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { analyzePassword } from '@/lib/password-policy';
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



const STRENGTH_LABELS = ['', 'Әлсіз', 'Орташа', 'Күшті'];
const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-yellow-400', 'bg-green-500'];
const STRENGTH_TEXT = ['', 'text-red-700', 'text-amber-800', 'text-green-700'];

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', phoneDigits: '', invitationToken: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const register = useAuthStore((s: any) => s.register);
  const router = useRouter();

  const pwA = analyzePassword(form.password);
  const passwordMismatch = !!form.confirmPassword && form.password !== form.confirmPassword;
  const phone = form.phoneDigits ? '+7' + form.phoneDigits : '';
  const isPasswordValid = pwA.valid;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 10);
    setForm((prev) => ({ ...prev, phoneDigits: d }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Парольдер сәйкес келмейді'); return; }
    if (!isPasswordValid) { toast.error('Пароль талаптарға сай емес'); return; }
    if (form.phoneDigits && form.phoneDigits.length !== 10) { toast.error('Телефон нөмірі толық емес'); return; }
    setLoading(true);
    setError('');
    try {
      await register(form.name, form.email, form.password, phone || undefined, form.invitationToken.trim() || undefined);
      toast.success('Тіркелу сәтті!');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Тіркелу қатесі орын алды');
      toast.error(err?.response?.data?.message || 'Тіркелу қатесі орын алды');
    } finally {
      setLoading(false);
    }
  };

  const ic = (err?: boolean) =>
    `input min-h-12 pr-12 ${err ? 'border-red-400 bg-red-50' : ''}`;

  return (
    <PremiumAuthFrame title="Оқу жолыңызды бастаңыз" description="Жаңа тіркелгі жасап, өзіңізге сай курсты таңдаңыз.">
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
          <div>
            <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 mb-1">Аты-жөні <span className="text-red-500">*</span></label>
            <input id="register-name" autoComplete="name" name="name" type="text" className={ic()} value={form.name} onChange={handleChange} placeholder="Толық атыңыз" required />
          </div>
          <div>
            <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input id="register-email" autoComplete="email" name="email" type="email" className={ic()} value={form.email} onChange={handleChange} placeholder="email@example.com" required />
          </div>
          <div>
            <label htmlFor="register-phone" className="block text-sm font-medium text-gray-700 mb-1">Телефон нөмірі <span className="font-normal text-gray-500">(міндетті емес)</span></label>
            <div className="flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 rounded-l-lg bg-gray-100 text-gray-700 font-mono font-semibold text-sm select-none">+7</span>
              <input id="register-phone" autoComplete="tel-national" type="tel" inputMode="numeric" aria-describedby="phone-hint" aria-invalid={!!form.phoneDigits && form.phoneDigits.length !== 10}
                className={`min-h-12 min-w-0 flex-1 border rounded-r-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono ${form.phoneDigits && form.phoneDigits.length !== 10 ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                value={form.phoneDigits} onChange={handlePhone} placeholder="7001234567" maxLength={10} />
            </div>
            <div id="phone-hint" aria-live="polite">{form.phoneDigits.length > 0 && form.phoneDigits.length < 10 && (
              <p className="text-xs text-red-700 mt-1">Тағы {10 - form.phoneDigits.length} цифр енгізіңіз</p>
            )}
            {form.phoneDigits.length === 10 && <p className="text-xs text-green-700 mt-1">✓ {phone}</p>}</div>
          </div>
          <div>
            <label htmlFor="register-invitation" className="block text-sm font-medium text-gray-700 mb-1">Пилотқа шақыру коды <span className="font-normal text-gray-500">(шақырылғандар үшін)</span></label>
            <input id="register-invitation" autoComplete="off" name="invitationToken" type="password" className={ic()} value={form.invitationToken} onChange={handleChange} maxLength={128} aria-describedby="invitation-hint" />
            <p id="invitation-hint" className="mt-1 text-xs text-gray-500">Кодты пилот иесі жеке береді. Оны сілтемеге қоспаңыз және басқа адамға жібермеңіз.</p>
          </div>
          <div>
            <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">Құпиясөз <span className="text-red-500">*</span></label>
            <div className="relative">
              <input id="register-password" autoComplete="new-password" aria-describedby="password-rules" aria-invalid={!!form.password && !isPasswordValid} name="password" type={showPassword ? 'text' : 'password'}
                className={`input min-h-12 pr-12 ${form.password && !isPasswordValid ? 'border-red-300' : ''}`}
                value={form.password} onChange={handleChange} placeholder="Құпиясөз" required />
              <button type="button" aria-label={showPassword ? 'Құпиясөзді жасыру' : 'Құпиясөзді көрсету'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl" onClick={() => setShowPassword(v => !v)}><EyeIcon open={showPassword} /></button>
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
            <div id="password-rules" className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3">
              {[
                { ok: pwA.checks.bytes, label: 'Ең көбі 72 UTF-8 байт' },
                { ok: pwA.checks.length, label: 'Кемінде 6 символ' },
                { ok: pwA.checks.digits, label: `Кемінде 2 цифр (қазір: ${pwA.digits})` },
                { ok: pwA.checks.specials, label: `Кемінде 2 арнайы таңба (қазір: ${pwA.specials})` },
              ].map(({ ok, label }) => (
                <p key={label} className={`text-xs flex items-center gap-1 ${ok ? 'text-green-700' : 'text-gray-600'}`}>
                  <span>{ok ? '✓' : '○'}</span> {label}
                </p>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="register-confirm" className="block text-sm font-medium text-gray-700 mb-1">Құпиясөзді растау <span className="text-red-500">*</span></label>
            <div className="relative">
              <input id="register-confirm" autoComplete="new-password" aria-describedby="confirm-hint" aria-invalid={passwordMismatch} name="confirmPassword" type={showConfirm ? 'text' : 'password'} className={ic(passwordMismatch)}
                value={form.confirmPassword} onChange={handleChange} placeholder="Құпиясөз" required />
              <button type="button" aria-label={showConfirm ? 'Растау құпиясөзін жасыру' : 'Растау құпиясөзін көрсету'} aria-pressed={showConfirm} className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl" onClick={() => setShowConfirm(v => !v)}><EyeIcon open={showConfirm} /></button>
            </div>
            <div id="confirm-hint" aria-live="polite">{passwordMismatch && <p className="text-xs text-red-700 mt-1">Құпиясөздер сәйкес келмейді</p>}
            {form.confirmPassword && !passwordMismatch && <p className="text-xs text-green-700 mt-1">✓ Құпиясөздер сәйкес</p>}</div>
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button type="submit"
            disabled={loading || !isPasswordValid || passwordMismatch || (form.phoneDigits.length > 0 && form.phoneDigits.length !== 10)}
            className="btn-primary min-h-12 w-full">
            {loading ? 'Тіркелуде...' : 'Тіркелу'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Тіркелгіңіз бар ма?{' '}
          <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">Кіру</Link>
        </p>
        <p className="text-center mt-4">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg text-xs text-gray-600 hover:text-violet-700 transition-colors">← Басты бетке оралу</Link>
        </p>
    </PremiumAuthFrame>
  );
}
