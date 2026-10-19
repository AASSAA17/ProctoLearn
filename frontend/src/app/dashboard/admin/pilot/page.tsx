'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { useRegistrationPolicy } from '@/lib/use-registration-policy';

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
  const { policy, error: policyError, retry: retryPolicy } = useRegistrationPolicy();
  const [action, setAction] = useState<{ kind: 'suspend' | 'resume' | 'withdraw' | 'revoke'; target: string; userId?: string; courseId?: string; invitationId?: string } | null>(null);
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
  useEffect(() => { if (policy?.invitationRequired) void load(); }, [load, policy]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setOneTimeToken(null);
    try {
      const { data } = await api.post('/pilot/invitations', { email: email.trim(), expiresInHours: hours });
      setOneTimeToken({ email: data.email, token: data.activationToken, expiresAt: data.expiresAt });
      setEmail(''); await load(); toast.success('Шақыру жасалды');
    } catch (requestError: any) { toast.error(requestError?.response?.data?.message || 'Шақыру жасау мүмкін болмады'); }
    finally { setBusy(false); }
  };
  const inspect = async (userId: string) => { try { setProgress((await api.get<Progress>(`/pilot/members/${userId}/progress`)).data); } catch (error: any) { toast.error(error?.response?.data?.message || 'Прогресті оқу мүмкін болмады'); } };
  const confirmAction = async (reason: string) => {
    if (!action) return;
    if (action.kind === 'revoke') await api.post(`/pilot/invitations/${action.invitationId}/revoke`);
    else if (action.kind === 'withdraw') await api.post(`/pilot/members/${action.userId}/courses/${action.courseId}/withdraw`);
    else await api.post(`/pilot/members/${action.userId}/${action.kind}`, action.kind === 'suspend' ? { reason } : {});
    await load();
    if (progress && action.userId === progress.user.id) await inspect(progress.user.id);
    toast.success('Өзгеріс сақталды');
  };

  if (!policy) return <section className="card" aria-live="polite">{policyError ? <><p role="alert">Режимді анықтау мүмкін болмады.</p><button className="btn-secondary mt-3" onClick={retryPolicy}>Қайталау</button></> : 'Режим жүктелуде…'}</section>;
  if (!policy.invitationRequired) return <section className="card"><h1 className="text-2xl font-semibold">Ашық тіркелу қосылған</h1><p className="mt-3 text-slate-600">Қазір шақыру қажет емес. Пилоттың шақырулары мен орын шектеулері қолданылмайды.</p><Link href="/dashboard/admin/users" className="btn-primary mt-5 inline-flex min-h-11 items-center">Пайдаланушыларды басқару</Link></section>;

  return <div className="space-y-6">
    {action && <ConfirmActionDialog title={action.kind === 'suspend' ? 'Қолжетімділікті тоқтату' : action.kind === 'resume' ? 'Қолжетімділікті қалпына келтіру' : action.kind === 'revoke' ? 'Шақыруды қайтару' : 'Курсқа қолжетімділікті тоқтату'}
      description={`${action.target}. ${action.kind === 'resume' ? 'Қатысушы пилотқа қайта кіре алады.' : action.kind === 'revoke' ? 'Бұл шақыру енді қолданылмайды.' : 'Қолжетімділік тоқтатылады. Бұрынғы прогресс, бағалар мен сертификаттар сақталады.'}`}
      requireReason={action.kind === 'suspend'} onConfirm={confirmAction} onClose={() => setAction(null)} />}
    <div><p className="text-xs font-bold uppercase tracking-widest text-violet-700">Басқарылатын пилот</p><h1 className="mt-2 text-3xl font-bold">Қатысушылар мен орындар</h1><p className="mt-2 text-sm text-slate-600">Бұл бөлім тек жергілікті әкімшіге арналған. Шақыру коды бір рет көрсетіледі.</p></div>
    {error && <div role="alert" className="workspace-banner">{error}<button className="ml-3 underline" onClick={() => void load()}>Қайталау</button></div>}
    {overview && <section className="grid gap-3 sm:grid-cols-3" aria-label="Пилот көлемі">
      {[['Қабылданған қатысушылар', `${overview.occupancy.members} / ${overview.limits.participants}`], ['Белсенді', String(overview.occupancy.active)], ['Күтудегі шақыру', String(overview.occupancy.pendingInvitations)]].map(([label, value]) => <div key={label} className="card"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
    </section>}
    {overview && <p className="text-sm text-slate-600">Тоқтатылған қатысушылар: {overview.members.filter(member => member.status === 'SUSPENDED').length}. Олардың топтағы орны сақталады. Күтудегі шақырулар да топ шегіне кіреді. Курс орындары жеке есептеледі.</p>}
    <section className="card"><h2 className="text-xl font-semibold">Жаңа шақыру</h2><form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
      <label className="text-sm">Email<input className="input mt-1" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label className="text-sm">Мерзімі, сағат<input className="input mt-1" type="number" min={1} max={168} value={hours} onChange={event => setHours(Number(event.target.value))} required /></label>
      <button className="btn-primary self-end" disabled={busy}>{busy ? 'Жасалуда…' : 'Шақыру жасау'}</button>
    </form>
    {oneTimeToken && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-semibold">Кодты қазір қауіпсіз арнамен {oneTimeToken.email} мекенжайының иесіне беріңіз</p><p className="mt-1 text-xs text-slate-600">Мерзімі: {new Date(oneTimeToken.expiresAt).toLocaleString('kk-KZ')}. Бұл код қайта көрсетілмейді.</p><code className="mt-3 block break-all rounded bg-white p-3 text-sm" aria-label="Бір реттік шақыру коды">{oneTimeToken.token}</code><button type="button" className="btn-secondary mt-3" onClick={() => navigator.clipboard.writeText(oneTimeToken.token).then(() => toast.success('Код көшірілді')).catch(() => toast.error('Қолмен көшіріңіз'))}>Кодты көшіру</button></div>}
    </section>
    <section className="card overflow-x-auto">{overview && overview.members.length === 0 && <div className="rounded-xl bg-violet-50 p-4 text-sm text-slate-700"><p className="font-semibold">Пилотқа әлі қатысушы қосылған жоқ.</p><p className="mt-1">Бірінші шақыруды жасаңыз.</p></div>}<h2 className="text-xl font-semibold">Қатысушылар</h2><table className="mt-4 w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Аты</th><th className="p-2">Email</th><th className="p-2">Күйі</th><th className="p-2">Әрекет</th></tr></thead><tbody>{overview?.members.map(member => <tr key={member.user.id} className="border-b"><td className="p-2">{member.user.name}</td><td className="p-2">{member.user.email}</td><td className="p-2">{member.status === 'ACTIVE' ? 'Белсенді' : 'Тоқтатылған'}</td><td className="flex gap-2 p-2"><button className="btn-secondary" onClick={() => void inspect(member.user.id)}>Прогресс</button><button className="btn-secondary" onClick={() => setAction({kind: member.status === 'ACTIVE' ? 'suspend' : 'resume', userId: member.user.id, target: member.user.name + ' · ' + member.user.email})}>{member.status === 'ACTIVE' ? 'Тоқтату' : 'Қалпына келтіру'}</button></td></tr>)}</tbody></table></section>
    {!!overview?.invitations?.length && <section className="card"><h2 className="text-xl font-semibold">Шақырулар</h2><ul className="mt-3 divide-y">{overview.invitations.map(invitation => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><strong>{invitation.email}</strong><br /><span className="text-slate-500">{invitation.redeemedAt ? 'Қолданылған' : invitation.revokedAt ? 'Қайтарылған' : new Date(invitation.expiresAt) < new Date() ? 'Мерзімі өткен' : 'Күтуде'}</span></span>{!invitation.redeemedAt && !invitation.revokedAt && new Date(invitation.expiresAt) > new Date() && <button className="btn-secondary" onClick={() => setAction({kind: 'revoke', invitationId: invitation.id, target: invitation.email})}>Қайтару</button>}</li>)}</ul></section>}
    {overview && <section className="card"><h2 className="text-xl font-semibold">Курс орындары</h2><ul className="mt-3 space-y-2">{overview.courses.map(course => <li key={course.id} className="flex justify-between gap-4 border-b py-2 text-sm"><span>{course.title}</span><strong>{course.occupied} / {course.capacity}</strong></li>)}</ul></section>}
    {progress && <section className="card" aria-live="polite"><div className="flex justify-between gap-3"><div><h2 className="text-xl font-semibold">{progress.user.name}</h2><p className="text-sm text-slate-500">{progress.user.email}</p></div><button className="btn-secondary" onClick={() => setProgress(null)}>Жабу</button></div><ul className="mt-4 space-y-3">{progress.enrollments.map(item => <li key={item.courseId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div><strong>{item.course.title}</strong><p className="mt-1 text-slate-600">Аяқталған сабақ: {item.completedLessons} · Қолжетімділік: {item.accessStatus}</p></div>{item.accessStatus === 'ACTIVE' && <button className="btn-secondary" onClick={() => setAction({kind: 'withdraw', userId: progress.user.id, courseId: item.courseId, target: progress.user.name + ' · ' + item.course.title})}>Курстан шығару</button>}</li>)}</ul></section>}
  </div>;
}
