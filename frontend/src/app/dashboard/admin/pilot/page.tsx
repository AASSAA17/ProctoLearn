'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

type Member = { status: 'ACTIVE' | 'SUSPENDED'; joinedAt: string; suspendedAt?: string | null; user: { id: string; name: string; email: string; lastSeen?: string | null } };
type Invitation = { id: string; email: string; createdAt: string; expiresAt: string; revokedAt?: string | null; redeemedAt?: string | null };
type Overview = {
  limits: { participants: number; defaultCourseSeats: number };
  occupancy: { members: number; active: number; pendingInvitations: number };
  members: Member[]; invitations?: Invitation[];
  courses: { id: string; title: string; occupied: number; capacity: number }[];
};
type Progress = { status: string; joinedAt: string; user: { id: string; name: string; email: string }; enrollments: { courseId: string; enrolledAt: string; completedAt?: string | null; accessStatus: string; course: { title: string }; completedLessons: number }[] };

export default function PilotAdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [email, setEmail] = useState('');
  const [hours, setHours] = useState(72);
  const [busy, setBusy] = useState(false);
  const [oneTimeToken, setOneTimeToken] = useState<{ email: string; token: string; expiresAt: string } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setOverview((await api.get<Overview>('/pilot/overview')).data); setError(''); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Пилот деректерін жүктеу мүмкін болмады.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setOneTimeToken(null);
    try {
      const { data } = await api.post('/pilot/invitations', { email: email.trim(), expiresInHours: hours });
      setOneTimeToken({ email: data.email, token: data.activationToken, expiresAt: data.expiresAt });
      setEmail(''); await load(); toast.success('Шақыру жасалды');
    } catch (requestError: any) { toast.error(requestError?.response?.data?.message || 'Шақыру жасау мүмкін болмады'); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => { try { await api.post(`/pilot/invitations/${id}/revoke`); await load(); toast.success('Шақыру қайтарылды'); } catch (error: any) { toast.error(error?.response?.data?.message || 'Шақыруды қайтару мүмкін болмады'); } };
  const membership = async (member: Member, suspend: boolean) => {
    let reason = '';
    if (suspend) { reason = window.prompt('Қолжетімділікті тоқтату себебі (кемінде 3 таңба):')?.trim() || ''; if (reason.length < 3) return; }
    try { await api.post(`/pilot/members/${member.user.id}/${suspend ? 'suspend' : 'resume'}`, suspend ? { reason } : {}); await load(); toast.success(suspend ? 'Қолжетімділік тоқтатылды' : 'Қолжетімділік қалпына келтірілді'); }
    catch (error: any) { toast.error(error?.response?.data?.message || 'Әрекетті орындау мүмкін болмады'); }
  };
  const inspect = async (userId: string) => { try { setProgress((await api.get<Progress>(`/pilot/members/${userId}/progress`)).data); } catch (error: any) { toast.error(error?.response?.data?.message || 'Прогресті оқу мүмкін болмады'); } };
  const withdraw = async (userId: string, courseId: string, title: string) => {
    if (!window.confirm(`«${title}» курсына қолжетімділікті тоқтатасыз ба? Бұрынғы прогресс пен нәтижелер сақталады.`)) return;
    try {
      await api.post(`/pilot/members/${userId}/courses/${courseId}/withdraw`);
      await Promise.all([load(), inspect(userId)]);
      toast.success('Курсқа қолжетімділік тоқтатылды');
    } catch (error: any) { toast.error(error?.response?.data?.message || 'Курсқа қолжетімділікті тоқтату мүмкін болмады'); }
  };

  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-violet-700">Басқарылатын пилот</p><h1 className="mt-2 text-3xl font-bold">Қатысушылар мен орындар</h1><p className="mt-2 text-sm text-slate-600">Бұл бөлім тек жергілікті әкімшіге арналған. Шақыру коды бір рет көрсетіледі.</p></div>
    {error && <div role="alert" className="workspace-banner">{error}<button className="ml-3 underline" onClick={() => void load()}>Қайталау</button></div>}
    {overview && <section className="grid gap-3 sm:grid-cols-3" aria-label="Пилот көлемі">
      {[['Қатысушы', `${overview.occupancy.members} / ${overview.limits.participants}`], ['Белсенді', String(overview.occupancy.active)], ['Күтудегі шақыру', String(overview.occupancy.pendingInvitations)]].map(([label, value]) => <div key={label} className="card"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
    </section>}
    <section className="card"><h2 className="text-xl font-semibold">Жаңа шақыру</h2><form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
      <label className="text-sm">Email<input className="input mt-1" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label className="text-sm">Мерзімі, сағат<input className="input mt-1" type="number" min={1} max={168} value={hours} onChange={event => setHours(Number(event.target.value))} required /></label>
      <button className="btn-primary self-end" disabled={busy}>{busy ? 'Жасалуда…' : 'Шақыру жасау'}</button>
    </form>
    {oneTimeToken && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-semibold">Кодты қазір қауіпсіз арнамен {oneTimeToken.email} мекенжайының иесіне беріңіз</p><p className="mt-1 text-xs text-slate-600">Мерзімі: {new Date(oneTimeToken.expiresAt).toLocaleString('kk-KZ')}. Бұл код қайта көрсетілмейді.</p><code className="mt-3 block break-all rounded bg-white p-3 text-sm" aria-label="Бір реттік шақыру коды">{oneTimeToken.token}</code><button type="button" className="btn-secondary mt-3" onClick={() => navigator.clipboard.writeText(oneTimeToken.token).then(() => toast.success('Код көшірілді')).catch(() => toast.error('Қолмен көшіріңіз'))}>Кодты көшіру</button></div>}
    </section>
    <section className="card overflow-x-auto"><h2 className="text-xl font-semibold">Қатысушылар</h2><table className="mt-4 w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Аты</th><th className="p-2">Email</th><th className="p-2">Күйі</th><th className="p-2">Әрекет</th></tr></thead><tbody>{overview?.members.map(member => <tr key={member.user.id} className="border-b"><td className="p-2">{member.user.name}</td><td className="p-2">{member.user.email}</td><td className="p-2">{member.status === 'ACTIVE' ? 'Белсенді' : 'Тоқтатылған'}</td><td className="flex gap-2 p-2"><button className="btn-secondary" onClick={() => void inspect(member.user.id)}>Прогресс</button><button className="btn-secondary" onClick={() => void membership(member, member.status === 'ACTIVE')}>{member.status === 'ACTIVE' ? 'Тоқтату' : 'Қалпына келтіру'}</button></td></tr>)}</tbody></table></section>
    {!!overview?.invitations?.length && <section className="card"><h2 className="text-xl font-semibold">Шақырулар</h2><ul className="mt-3 divide-y">{overview.invitations.map(invitation => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><strong>{invitation.email}</strong><br /><span className="text-slate-500">{invitation.redeemedAt ? 'Қолданылған' : invitation.revokedAt ? 'Қайтарылған' : new Date(invitation.expiresAt) < new Date() ? 'Мерзімі өткен' : 'Күтуде'}</span></span>{!invitation.redeemedAt && !invitation.revokedAt && new Date(invitation.expiresAt) > new Date() && <button className="btn-secondary" onClick={() => void revoke(invitation.id)}>Қайтару</button>}</li>)}</ul></section>}
    {overview && <section className="card"><h2 className="text-xl font-semibold">Курс орындары</h2><ul className="mt-3 space-y-2">{overview.courses.map(course => <li key={course.id} className="flex justify-between gap-4 border-b py-2 text-sm"><span>{course.title}</span><strong>{course.occupied} / {course.capacity}</strong></li>)}</ul></section>}
    {progress && <section className="card" aria-live="polite"><div className="flex justify-between gap-3"><div><h2 className="text-xl font-semibold">{progress.user.name}</h2><p className="text-sm text-slate-500">{progress.user.email}</p></div><button className="btn-secondary" onClick={() => setProgress(null)}>Жабу</button></div><ul className="mt-4 space-y-3">{progress.enrollments.map(item => <li key={item.courseId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div><strong>{item.course.title}</strong><p className="mt-1 text-slate-600">Аяқталған сабақ: {item.completedLessons} · Қолжетімділік: {item.accessStatus}</p></div>{item.accessStatus === 'ACTIVE' && <button className="btn-secondary" onClick={() => void withdraw(progress.user.id, item.courseId, item.course.title)}>Курстан шығару</button>}</li>)}</ul></section>}
  </div>;
}
