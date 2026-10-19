'use client';

import { useEffect, useMemo, useState } from 'react';

interface ReviewStep { type: 'VIDEO' | 'TEXT' | 'TASK'; content: Record<string, unknown> }
interface ReviewLesson { id: string; steps: ReviewStep[] }
interface ReviewModule { id: string; lessons: ReviewLesson[] }
interface ReviewExam { id: string; title: string; duration: number; passScore: number; _count?: { questions: number } }

interface ReviewCourse {
  id: string;
  title: string;
  description?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  modules: ReviewModule[];
}

const MANUAL_ITEMS = [
  { id: 'outcomes', label: 'Оқу нәтижелері мен алғышарттар тексерілді' },
  { id: 'proctor', label: 'Емтихан саясаты және проктор тағайындауы тексерілді' },
  { id: 'media', label: 'Медиа, сыртқы сілтемелер және лицензиялар тексерілді' },
  { id: 'accessibility', label: 'Қолжетімділік пен пернетақта арқылы оқу тексерілді' },
  { id: 'language', label: 'Қазақ тілі мен терминологиясы тексерілді' },
] as const;

type ManualId = (typeof MANUAL_ITEMS)[number]['id'];
type ManualState = Partial<Record<ManualId, boolean>>;

export default function CourseReviewChecklist({ course, exams }: { course: ReviewCourse; exams: ReviewExam[] }) {
  const storageKey = `proctolearn:course-review-draft:${course.id}`;
  const [manual, setManual] = useState<ManualState>({});
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const request = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        const parsed = stored ? JSON.parse(stored) : {};
        setManual(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        setManual({});
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(request);
  }, [storageKey]);

  const lessons = useMemo(() => course.modules.flatMap((module) => module.lessons), [course.modules]);
  const steps = useMemo(() => lessons.flatMap((lesson) => lesson.steps), [lessons]);
  const automated = [
    { label: 'Курс атауы мен сипаттамасы толтырылған', passed: Boolean(course.title.trim() && course.description?.trim()) },
    { label: 'Әр бөлімде сабақ, әр сабақта оқу қадамы бар', passed: course.modules.length > 0 && course.modules.every((module) => module.lessons.length > 0 && module.lessons.every((lesson) => lesson.steps.length > 0)) },
    { label: 'Практикалық тапсырмалар қосылған', passed: steps.some((step) => step.type === 'TASK') },
    { label: 'Тапсырма сұрақтары бос емес', passed: steps.filter((step) => step.type === 'TASK').every((step) => typeof step.content.question === 'string' && step.content.question.trim().length > 0) },
    { label: 'Емтиханның ұзақтығы, өту балы және сұрақтары берілген', passed: exams.length > 0 && exams.every((exam) => exam.duration > 0 && exam.passScore >= 0 && exam.passScore <= 100 && (exam._count?.questions ?? 0) > 0) },
  ];
  const automatedPassed = automated.filter((item) => item.passed).length;
  const manualPassed = MANUAL_ITEMS.filter((item) => manual[item.id]).length;
  const structureReady = automatedPassed === automated.length;
  const preliminary = course.description?.trimStart().startsWith('Алдын ала оқу материалы.') ?? false;
  const publicationLabel = course.status === 'PUBLISHED'
    ? preliminary ? 'Алдын ала жарияланған' : 'Жарияланған'
    : course.status === 'DRAFT' ? 'Жоба' : 'Мұрағатта';
  const workflow = [
    { label: 'Жоба серверде сақталған', state: 'known', detail: 'Редактор API-ден жүктеген нұсқа' },
    { label: 'Құрылымдық тексеру', state: structureReady ? 'known' : 'pending', detail: `${automatedPassed}/${automated.length} шарт орындалды` },
    { label: 'Техникалық тексерулер', state: 'unknown', detail: 'Нәтиже редактор API-де сақталмайды' },
    { label: 'Адам тексеруі', state: preliminary ? 'pending' : 'unknown', detail: preliminary ? 'Алдын ала материал үшін тексеру күтілуде' : 'Мәртебе ағымдағы API-де берілмейді' },
    { label: 'Жариялау', state: course.status === 'PUBLISHED' ? 'known' : 'pending', detail: course.status === 'PUBLISHED' ? publicationLabel : 'Жарияланбаған' },
    { label: 'Мұрағат', state: course.status === 'ARCHIVED' ? 'known' : 'unknown', detail: course.status === 'ARCHIVED' ? 'Курс мұрағатта' : 'Қолданылмайды' },
  ] as const;

  const toggle = (id: ManualId) => {
    const next = { ...manual, [id]: !manual[id] };
    setManual(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* local draft remains usable in memory */ }
  };

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 space-y-5" aria-labelledby="course-review-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Жариялау алдындағы тексеру</p>
          <h2 id="course-review-heading" className="mt-1 text-lg font-bold text-gray-950">Курс сапасын тексеру</h2>
          <p className="mt-1 text-sm text-gray-700">{preliminary ? 'Алдын ала материалдың адам тексеруі ағымдағы API-де расталған жоқ.' : 'Адам тексеруінің мәртебесі ағымдағы API-де берілмейді.'} Төмендегі белгілер осы браузердегі жергілікті жұмыс черновигі ғана.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${preliminary ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'}`}>{preliminary ? 'Адам тексеруі күтілуде' : 'Тексеру мәртебесі API-де жоқ'}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-xs text-gray-600">Сақталған күй</p><p className="mt-1 font-semibold text-gray-950">{publicationLabel}</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-xs text-gray-600">Құрылымдық тексерулер</p><p className="mt-1 font-semibold text-gray-950">{automatedPassed}/{automated.length}</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-xs text-gray-600">Жергілікті қолмен тексеру</p><p className="mt-1 font-semibold text-gray-950">{manualPassed}/{MANUAL_ITEMS.length}</p></div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900">Курс күйінің нақты тізбегі</h3>
        <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {workflow.map((item, index) => (
            <li key={item.label} className="rounded-xl border border-white bg-white p-3">
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.state === 'known' ? 'bg-green-100 text-green-800' : item.state === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-600'}`}>{index + 1}</span>
                <div><p className="text-sm font-semibold text-gray-900">{item.label}</p><p className="mt-0.5 text-xs text-gray-600">{item.detail}</p></div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Құрылымнан анықталғаны</h3>
          <ul className="mt-2 space-y-2">
            {automated.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm text-gray-800">
                <span aria-hidden="true" className={item.passed ? 'text-green-700' : 'text-amber-700'}>{item.passed ? '✓' : '○'}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <fieldset disabled={!storageReady}>
          <legend className="text-sm font-bold text-gray-900">Преподаватель тексеретін тармақтар</legend>
          <div className="mt-2 space-y-2">
            {MANUAL_ITEMS.map((item) => (
              <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-800">
                <input type="checkbox" checked={Boolean(manual[item.id])} onChange={() => toggle(item.id)} className="mt-0.5 h-5 w-5 accent-primary-600" />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="text-xs text-gray-600">Бұл чек-лист курсты автоматты түрде жарияламайды, мұрағаттамайды және «мақұлданды» күйін жасамайды.</p>
    </section>
  );
}
