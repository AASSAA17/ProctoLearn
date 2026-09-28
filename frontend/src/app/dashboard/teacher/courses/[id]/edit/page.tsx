'use client';

import { useEffect, useState, useCallback, useId, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ProctorAssignments from '@/components/ProctorAssignments';
import OutlineSettings from '@/components/OutlineSettings';
import { ExamSettings, QuestionEditor, type EditableQuestion } from '@/components/ExamEditor';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
  id: string;
  type: 'VIDEO' | 'TEXT' | 'TASK';
  order: number;
  content: Record<string, any>;
}

interface Lesson {
  id: string;
  title: string;
  order: number;
  steps: Step[];
}

interface CourseModule {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  description?: string;
  level: string;
  modules: CourseModule[];
  exams?: Exam[];
}

interface Exam {
  id: string;
  title: string;
  duration: number;
  passScore: number;
  _count?: { questions: number; attempts: number };
}

const STEP_TYPE_LABELS: Record<string, string> = { VIDEO: '▶️ Бейне', TEXT: '📝 Мәтін', TASK: '✏️ Тапсырма' };
const TASK_TYPE_LABELS: Record<string, string> = {
  single_choice:   '○ Бір жауап',
  multiple_choice: '☑ Бірнеше жауап',
  text_input:      'Аа Мәтін жауабы',
  number_input:    '# Сан жауабы',
};

// ─── Step Form ────────────────────────────────────────────────────────────────
function StepForm({
  lessonId,
  existingStep,
  nextOrder,
  onSaved,
  onCancel,
}: {
  lessonId: string;
  existingStep?: Step;
  nextOrder: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<'VIDEO' | 'TEXT' | 'TASK'>(existingStep?.type ?? 'TEXT');
  const [order, setOrder] = useState(existingStep?.order ?? nextOrder);
  const [videoUrl, setVideoUrl] = useState(existingStep?.content?.videoUrl ?? '');
  const [videoDesc, setVideoDesc] = useState(existingStep?.content?.description ?? '');
  const [html, setHtml] = useState(existingStep?.content?.html ?? '');
  const [question, setQuestion] = useState(existingStep?.content?.question ?? '');
  const [taskType, setTaskType] = useState(existingStep?.content?.taskType ?? 'single_choice');
  const [options, setOptions] = useState<string[]>(existingStep?.content?.options ?? ['', '']);
  const [correctAnswer, setCorrectAnswer] = useState(String(existingStep?.content?.correctAnswer ?? ''));
  const [selectedOptions, setSelectedOptions] = useState<number[]>(() => {
    const answer = existingStep?.content?.correctAnswer;
    const answers = Array.isArray(answer) ? answer : [answer];
    return (existingStep?.content?.options ?? []).flatMap((option: string, index: number) => answers.includes(option) ? [index] : []);
  });
  const choiceGroup = useId();
  const [explanation, setExplanation] = useState(existingStep?.content?.explanation ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const buildContent = () => {
    if (type === 'VIDEO') return { videoUrl, description: videoDesc };
    if (type === 'TEXT') return { html };
    const choices = options.map(option => option.trim());
    const isChoice = taskType === 'single_choice' || taskType === 'multiple_choice';
    const answer = taskType === 'single_choice' ? choices[selectedOptions[0]] : taskType === 'multiple_choice' ? selectedOptions.map(index => choices[index]) : correctAnswer;
    return { question, taskType, ...(isChoice ? { options: choices } : {}), correctAnswer: answer, explanation };
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaveError('');
    if (!Number.isInteger(order) || order < 1) { setSaveError('Реті оң бүтін сан болуы керек.'); return; }
    if (type === 'TEXT' && !html.trim()) { setSaveError('Мәтін мазмұнын енгізіңіз.'); return; }
    if (type === 'VIDEO') {
      try { if (!['https:', 'http:'].includes(new URL(videoUrl).protocol)) throw new Error(); }
      catch { setSaveError('HTTP немесе HTTPS бейне сілтемесін енгізіңіз.'); return; }
    }
    if (type === 'TASK') {
      if (!question.trim()) { setSaveError('Сұрақ мәтінін енгізіңіз.'); return; }
      if (taskType === 'single_choice' || taskType === 'multiple_choice') {
        const choices = options.map(option => option.trim());
        if (choices.length < 2 || choices.some(option => !option) || new Set(choices).size !== choices.length) { setSaveError('Кемінде екі бос емес, қайталанбайтын нұсқа енгізіңіз.'); return; }
        if (!selectedOptions.length) { setSaveError('Дұрыс жауапты белгілеңіз.'); return; }
      } else if (!correctAnswer.trim() || (taskType === 'number_input' && !Number.isFinite(Number(correctAnswer)))) {
        setSaveError('Дұрыс жауапты енгізіңіз.'); return;
      }
    }
    setSaving(true);
    try {
      const payload = { type, order, content: buildContent() };
      if (existingStep) {
        await api.patch(`/steps/${existingStep.id}`, payload);
      } else {
        await api.post(`/lessons/${lessonId}/steps`, payload);
      }
      toast.success(existingStep ? 'Қадам жаңартылды' : 'Қадам қосылды');
      onSaved();
    } catch {
      setSaveError('Қадам сақталмады. Енгізілген деректер сақталды, қайта көріңіз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form aria-label="Қадам редакторы" onSubmit={handleSave} className="bg-blue-50 border border-blue-200 rounded-xl p-5">
      <fieldset disabled={saving} className="space-y-4 min-w-0">
      {saveError && <p role="alert" className="text-sm text-red-800">{saveError}</p>}
      <div className="flex flex-wrap gap-3">
        {(['VIDEO', 'TEXT', 'TASK'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {STEP_TYPE_LABELS[t]}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-600">Рет:</label>
          <input
            aria-label="Қадам реті"
            required
            type="number"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm"
            min={1}
          />
        </div>
      </div>

      {/* VIDEO fields */}
      {type === 'VIDEO' && (
        <div className="space-y-3">
          <input
            aria-label="Бейне сілтемесі"
            required
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Бейне URL (YouTube embed немесе тікелей)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            aria-label="Бейне сипаттамасы"
            type="text"
            value={videoDesc}
            onChange={(e) => setVideoDesc(e.target.value)}
            placeholder="Бейне сипаттамасы (міндетті емес)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      )}

      {/* TEXT fields */}
      {type === 'TEXT' && (
        <textarea
          aria-label="Мәтін мазмұны"
          required
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={5}
          placeholder="<p>Мәтін мазмұны...</p>"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        />
      )}

      {/* TASK fields */}
      {type === 'TASK' && (
        <div className="space-y-3">
          <textarea
            aria-label="Тапсырма сұрағы"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="Сұрақ мәтіні"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />

          <div className="flex gap-2 flex-wrap">
            {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                aria-pressed={taskType === k}
                onClick={() => { setTaskType(k); if (k === 'single_choice') setSelectedOptions(selectedOptions.slice(0, 1)); }}
                className={`px-3 py-1 text-xs rounded-lg border transition ${
                  taskType === k
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {(taskType === 'single_choice' || taskType === 'multiple_choice') && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Нұсқаларды енгізіп, дұрыс жауапты белгілеңіз.</p>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type={taskType === 'multiple_choice' ? 'checkbox' : 'radio'} name={choiceGroup}
                    aria-label={`Дұрыс жауап: ${i + 1}-нұсқа`} checked={selectedOptions.includes(i)}
                    onChange={event => setSelectedOptions(taskType === 'single_choice' ? [i] : event.target.checked ? [...selectedOptions, i] : selectedOptions.filter(index => index !== i))} />
                  <input
                    aria-label={`Жауап нұсқасы ${i + 1}`}
                    required
                    type="text"
                    value={opt}
                    onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                    placeholder={`${i + 1}-нұсқа`}
                    className="min-w-0 flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    aria-label={`Нұсқаны жою: ${i + 1}`}
                    disabled={options.length <= 2}
                    onClick={() => { setOptions(options.filter((_, j) => j !== i)); setSelectedOptions(selectedOptions.filter(index => index !== i).map(index => index > i ? index - 1 : index)); }}
                    className="text-red-700 hover:text-red-800 px-1 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptions([...options, ''])}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Нұсқа қосу
              </button>
            </div>
          )}

          {(taskType === 'text_input' || taskType === 'number_input') && <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Дұрыс жауап:
            </label>
            <input
              aria-label="Дұрыс жауап"
              required
              step="any"
              type={taskType === 'number_input' ? 'number' : 'text'}
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>}

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Түсіндірме (міндетті емес):</label>
            <input
              aria-label="Жауап түсіндірмесі"
              type="text"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Дұрыс жауаптың түсіндірмесі"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? 'Сақталуда...' : existingStep ? 'Жаңарту' : 'Қосу'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-white text-gray-600 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 transition"
        >
          Болдырмау
        </button>
      </div>
      </fieldset>
    </form>
  );
}

// ─── Lesson Card ──────────────────────────────────────────────────────────────
function LessonCard({
  lesson,
  onRefresh,
}: {
  lesson: Lesson;
  onRefresh: () => void;
}) {
  const [editingSettings, setEditingSettings] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);

  const deleteStep = async (stepId: string) => {
    if (!confirm('Қадамды жою керек пе?')) return;
    try {
      await api.delete(`/steps/${stepId}`);
      toast.success('Қадам жойылды');
      onRefresh();
    } catch {
      toast.error('Жою қатесі');
    }
  };

  return (
    <div className="pl-4 border-l-2 border-gray-200 ml-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="text-sm font-medium text-gray-700 break-words">📖 {lesson.order}. {lesson.title}</span>
        <span className="text-xs text-gray-600 ml-auto">{lesson.steps.length} қадам</span>
        <button type="button" aria-label={`Сабақты өңдеу: ${lesson.title}`} onClick={() => setEditingSettings(true)} className="text-xs text-blue-700 underline">Өңдеу</button>
      </div>
      {editingSettings && <OutlineSettings kind="lesson" item={lesson} onSaved={() => { setEditingSettings(false); onRefresh(); }} onCancel={() => setEditingSettings(false)} />}

      {/* Steps */}
      {lesson.steps.map((step) => (
        <div key={step.id}>
          {editingStep?.id === step.id ? (
            <StepForm
              lessonId={lesson.id}
              existingStep={step}
              nextOrder={lesson.steps.length + 1}
              onSaved={() => { setEditingStep(null); onRefresh(); }}
              onCancel={() => setEditingStep(null)}
            />
          ) : (
            <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 group">
              <span className="text-xs text-gray-600">{step.order}.</span>
              <span className="text-xs font-medium">{STEP_TYPE_LABELS[step.type]}</span>
              <span className="text-xs text-gray-600 min-w-0 flex-1 truncate">
                {step.type === 'TASK' && (step.content.question ?? '')}
                {step.type === 'VIDEO' && (step.content.videoUrl ?? '')}
                {step.type === 'TEXT' && '(мәтін)'}
              </span>
              <div className="flex gap-1">
                <button
                  aria-label={`Қадамды өңдеу: ${step.order}`}
                  onClick={() => setEditingStep(step)}
                  className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                >
                  Өңдеу
                </button>
                <button
                  aria-label={`Қадамды жою: ${step.order}`}
                  onClick={() => deleteStep(step.id)}
                  className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                >
                  Жою
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add step */}
      {addingStep ? (
        <StepForm
          lessonId={lesson.id}
          nextOrder={lesson.steps.length + 1}
          onSaved={() => { setAddingStep(false); onRefresh(); }}
          onCancel={() => setAddingStep(false)}
        />
      ) : (
        <button
          onClick={() => setAddingStep(true)}
          className="text-xs text-blue-700 hover:text-blue-800 flex items-center gap-1 py-1"
        >
          + Қадам қосу
        </button>
      )}
    </div>
  );
}

// ─── Module Card ──────────────────────────────────────────────────────────────
function ModuleCard({
  mod,
  courseId,
  onRefresh,
}: {
  mod: CourseModule;
  courseId: string;
  onRefresh: () => void;
}) {
  const [addingLesson, setAddingLesson] = useState(false);
  const [lessonForm, setLessonForm] = useState({ title: '', content: ' ', order: mod.lessons.length + 1 });
  const [savingLesson, setSavingLesson] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonForm.title.trim()) { toast.error('Атауды енгізіңіз'); return; }
    setSavingLesson(true);
    try {
      await api.post(`/modules/${mod.id}/lessons`, {
        title: lessonForm.title,
        content: lessonForm.content || ' ',
        order: lessonForm.order,
      });
      toast.success('Сабақ қосылды');
      setAddingLesson(false);
      setLessonForm({ title: '', content: ' ', order: mod.lessons.length + 2 });
      onRefresh();
    } catch {
      toast.error('Сабақ қосу қатесі');
    } finally {
      setSavingLesson(false);
    }
  };

  const deleteModule = async () => {
    if (!confirm(`"${mod.title}" бөлімін жою керек пе?`)) return;
    try {
      await api.delete(`/modules/${mod.id}`);
      toast.success('Бөлім жойылды');
      onRefresh();
    } catch {
      toast.error('Жою қатесі');
    }
  };

  const deleteLesson = async (lessonId: string) => {
    if (!confirm('Сабақты жою керек пе?')) return;
    try {
      await api.delete(`/lessons/${lessonId}`);
      toast.success('Сабақ жойылды');
      onRefresh();
    } catch {
      toast.error('Жою қатесі');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Module header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
        <button aria-label={`Бөлім: ${mod.title}`} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="text-gray-600 hover:text-gray-800 text-sm">
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="font-semibold text-gray-800 flex-1 min-w-0 break-words">
          {mod.order}. {mod.title}
        </span>
        <span className="text-xs text-gray-600">{mod.lessons.length} сабақ</span>
        <button type="button" aria-label={`Бөлімді өңдеу: ${mod.title}`} onClick={() => setEditingSettings(true)} className="text-xs text-blue-700 underline">Өңдеу</button>
        <button
          onClick={deleteModule}
          className="text-xs text-red-700 hover:text-red-800 px-2 py-1 hover:bg-red-50 rounded"
        >
          Жою
        </button>
      </div>

      {editingSettings && <div className="p-4"><OutlineSettings kind="module" item={mod} onSaved={() => { setEditingSettings(false); onRefresh(); }} onCancel={() => setEditingSettings(false)} /></div>}

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Lessons */}
          {mod.lessons.map((lesson) => (
            <div key={lesson.id} className="group">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <LessonCard lesson={lesson} onRefresh={onRefresh} />
                </div>
                <button
                  aria-label={`Сабақты жою: ${lesson.title}`}
                  onClick={() => deleteLesson(lesson.id)}
                  className="text-xs text-red-700 hover:text-red-800 mt-2"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {/* Add lesson form */}
          {addingLesson ? (
            <form onSubmit={handleAddLesson} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Жаңа сабақ</p>
              <input
                aria-label="Сабақ атауы"
                type="text"
                value={lessonForm.title}
                onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Сабақ атауы"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Рет:</label>
                <input
                  aria-label="Сабақ реті"
                  type="number"
                  value={lessonForm.order}
                  onChange={(e) => setLessonForm((p) => ({ ...p, order: Number(e.target.value) }))}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  min={1}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingLesson}
                  className="px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingLesson ? 'Қосылуда...' : 'Қосу'}
                </button>
                <button
                  type="button"
                  onClick={() => setAddingLesson(false)}
                  className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
                >
                  Болдырмау
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => { setAddingLesson(true); setLessonForm((p) => ({ ...p, order: mod.lessons.length + 1 })); }}
              className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1 py-1"
            >
              + Сабақ қосу
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Edit Page ───────────────────────────────────────────────────────────
export default function EditCoursePage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingModule, setAddingModule] = useState(false);
  const [moduleForm, setModuleForm] = useState({ title: '', order: 1 });
  const [savingModule, setSavingModule] = useState(false);

  // Exam management state
  const [exams, setExams] = useState<Exam[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState(false);
  const [addingExam, setAddingExam] = useState(false);
  const [examForm, setExamForm] = useState({ title: '', duration: 30, passScore: 60 });
  const [savingExam, setSavingExam] = useState(false);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [editingExam, setEditingExam] = useState<string | null>(null);
  const [examQuestions, setExamQuestions] = useState<EditableQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState(false);
  const questionRequest = useRef(0);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

  const loadCourse = useCallback(async () => {
    try {
      const { data } = await api.get(`/courses/${courseId}/material`);
      setCourse(data);
      setModuleForm((p) => ({ ...p, order: (data.modules?.length ?? 0) + 1 }));
    } catch {
      toast.error('Курс жүктеу қатесі');
      router.push('/dashboard/teacher/courses');
    } finally {
      setLoading(false);
    }
  }, [courseId, router]);

  const loadExams = useCallback(async () => {
    setExamsLoading(true);
    setExamsError(false);
    try {
      const { data } = await api.get(`/courses/${courseId}/exams`);
      setExams(data);
    } catch {
      setExamsError(true);
    } finally {
      setExamsLoading(false);
    }
  }, [courseId]);

  const loadExamQuestions = async (examId: string) => {
    const request = ++questionRequest.current;
    setQuestionsLoading(true);
    setQuestionsError(false);
    setExamQuestions([]);
    try {
      const { data } = await api.get(`/courses/${courseId}/exams/${examId}`);
      if (request === questionRequest.current) setExamQuestions(data.questions ?? []);
    } catch {
      if (request === questionRequest.current) setQuestionsError(true);
    } finally {
      if (request === questionRequest.current) setQuestionsLoading(false);
    }
  };

  useEffect(() => { loadCourse(); loadExams(); }, [loadCourse, loadExams]);

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleForm.title.trim()) { toast.error('Атауды енгізіңіз'); return; }
    setSavingModule(true);
    try {
      await api.post(`/courses/${courseId}/modules`, moduleForm);
      toast.success('Бөлім қосылды');
      setAddingModule(false);
      setModuleForm({ title: '', order: (course?.modules?.length ?? 0) + 2 });
      loadCourse();
    } catch {
      toast.error('Бөлім қосу қатесі');
    } finally {
      setSavingModule(false);
    }
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examForm.title.trim()) { toast.error('Атауды енгізіңіз'); return; }
    setSavingExam(true);
    try {
      await api.post(`/courses/${courseId}/exams`, { ...examForm, questions: [] });
      toast.success('Емтихан қосылды');
      setAddingExam(false);
      setExamForm({ title: '', duration: 30, passScore: 60 });
      loadExams();
    } catch {
      toast.error('Емтихан қосу қатесі');
    } finally {
      setSavingExam(false);
    }
  };

  const handleDeleteExam = async (examId: string, title: string) => {
    if (!confirm(`"${title}" емтиханын жою керек пе?`)) return;
    try {
      await api.delete(`/courses/${courseId}/exams/${examId}`);
      toast.success('Емтихан жойылды');
      setExams((prev) => prev.filter((e) => e.id !== examId));
      if (expandedExam === examId) setExpandedExam(null);
    } catch {
      toast.error('Жою қатесі');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Сұрақты жою керек пе?')) return;
    try {
      await api.delete(`/courses/${courseId}/exams/${expandedExam}/questions/${questionId}`);
      toast.success('Сұрақ жойылды');
      setExamQuestions((prev) => prev.filter((q) => q.id !== questionId));
      loadExams();
    } catch {
      toast.error('Жою қатесі');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }
  if (!course) return null;

  const totalSteps = course.modules.reduce(
    (sum, m) => sum + m.lessons.reduce((ls, l) => ls + l.steps.length, 0),
    0,
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/teacher/courses" className="hover:text-primary-600">Курстар</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium truncate">{course.title}</span>
      </div>

      {/* Course info header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{course.title}</h1>
          {course.description && <p className="text-sm text-gray-500 mt-1">{course.description}</p>}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            <span>📦 {course.modules.length} бөлім</span>
            <span>
              📖{' '}
              {course.modules.reduce((s, m) => s + m.lessons.length, 0)} сабақ
            </span>
            <span>⚡ {totalSteps} қадам</span>
            <span>📝 {exams.length} емтихан</span>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Курс құрылымы</h2>

        {course.modules.length === 0 && (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200 text-gray-600">
            <p className="text-3xl mb-2">📦</p>
            <p className="text-sm">Бөлімдер жоқ. Алғашқы бөлімді қосыңыз.</p>
          </div>
        )}

        {course.modules.map((mod) => (
          <ModuleCard key={mod.id} mod={mod} courseId={courseId} onRefresh={loadCourse} />
        ))}

        {/* Add module form */}
        {addingModule ? (
          <form
            onSubmit={handleAddModule}
            className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 space-y-3"
          >
            <p className="text-sm font-semibold text-indigo-800">Жаңа бөлім</p>
            <input
              aria-label="Бөлім атауы"
              type="text"
              value={moduleForm.title}
              onChange={(e) => setModuleForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Бөлім атауы (мысалы: 1-тарау: Кіріспе)"
              className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Рет:</label>
              <input
                aria-label="Бөлім реті"
                type="number"
                value={moduleForm.order}
                onChange={(e) => setModuleForm((p) => ({ ...p, order: Number(e.target.value) }))}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                min={1}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingModule}
                className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingModule ? 'Қосылуда...' : 'Бөлімді қосу'}
              </button>
              <button
                type="button"
                onClick={() => setAddingModule(false)}
                className="px-5 py-2 bg-white text-gray-600 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
              >
                Болдырмау
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => { setAddingModule(true); setModuleForm({ title: '', order: course.modules.length + 1 }); }}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-primary-400 hover:text-primary-600 transition text-sm font-medium"
          >
            + Бөлім қосу
          </button>
        )}
      </div>

      {/* ─── Exams Section ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Емтихандар</h2>

        {examsLoading && <p role="status" className="text-sm text-gray-600">Емтихандар жүктелуде...</p>}
        {examsError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Емтихандарды жүктеу мүмкін болмады. <button type="button" onClick={() => void loadExams()} className="font-medium underline">Қайта жүктеу</button>
        </div>}
        {!examsLoading && !examsError && exams.length === 0 && !addingExam && (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200 text-gray-600">
            <p className="text-3xl mb-2">📝</p>
            <p className="text-sm">Емтихан жоқ. Алғашқы емтиханды қосыңыз.</p>
          </div>
        )}

        {exams.map((exam) => (
          <div key={exam.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{exam.title}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-600 mt-1">
                  <span>⏱ {exam.duration} мин</span>
                  <span>✅ Өту: {exam.passScore}%</span>
                  <span>❓ {exam._count?.questions ?? 0} сұрақ</span>
                  <span>📊 {exam._count?.attempts ?? 0} талпыныс</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" aria-label={`Емтиханды өңдеу: ${exam.title}`} onClick={() => setEditingExam(exam.id)} className="text-blue-700 text-xs underline">Өңдеу</button>
                <button
                  type="button"
                  onClick={() => handleDeleteExam(exam.id, exam.title)}
                  className="text-red-700 hover:text-red-800 text-xs"
                >
                  🗑 Жою
                </button>
                <button type="button" aria-label={`Сұрақтарды көрсету: ${exam.title}`} aria-expanded={expandedExam === exam.id} onClick={() => {
                  setAddingQuestion(false);
                  setEditingQuestion(null);
                  if (expandedExam === exam.id) {
                    questionRequest.current++;
                    setExpandedExam(null);
                  } else {
                    setExpandedExam(exam.id);
                    void loadExamQuestions(exam.id);
                  }
                }} className="rounded px-2 py-1 text-sm text-blue-700">{expandedExam === exam.id ? '▲' : '▼'}</button>
              </div>
            </div>
            {editingExam === exam.id && <div className="px-5 pb-4"><ExamSettings courseId={courseId} exam={exam} onSaved={() => { setEditingExam(null); void loadExams(); }} onCancel={() => setEditingExam(null)} /></div>}

            {expandedExam === exam.id && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                <ProctorAssignments examId={exam.id} />
                {/* Existing questions */}
                {questionsLoading && <p role="status" className="text-gray-600 text-sm text-center py-4">Сұрақтар жүктелуде...</p>}
                {questionsError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  Сұрақтарды жүктеу мүмкін болмады. <button type="button" onClick={() => void loadExamQuestions(exam.id)} className="font-medium underline">Қайта жүктеу</button>
                </div>}
                {!questionsLoading && !questionsError && examQuestions.length === 0 && !addingQuestion && (
                  <p className="text-gray-600 text-sm text-center py-4">Сұрақтар жоқ</p>
                )}
                {!questionsLoading && examQuestions.map((q, qi) => editingQuestion === q.id ? <QuestionEditor key={q.id} courseId={courseId} examId={exam.id} question={q} onSaved={() => { setEditingQuestion(null); void loadExamQuestions(exam.id); void loadExams(); }} onCancel={() => setEditingQuestion(null)} /> : (
                  <div key={q.id} className="bg-gray-50 rounded-lg p-3 flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {qi + 1}. {q.text}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {q.type === 'SINGLE_CHOICE' ? '○ Бір жауап' : q.type === 'MULTIPLE_CHOICE' ? '☑ Бірнеше' : 'Аа Мәтін'}
                        {q.options && q.options.length > 0 && ` · ${q.options.length} нұсқа`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" aria-label={`Сұрақты өңдеу: ${q.text}`} onClick={() => setEditingQuestion(q.id)} className="text-blue-700 text-xs underline">Өңдеу</button>
                      <button type="button" aria-label={`Сұрақты жою: ${q.text}`} onClick={() => handleDeleteQuestion(q.id)} className="text-red-700 hover:text-red-800 text-xs">✕</button>
                    </div>
                  </div>
                ))}

                {/* Add question form */}
                {addingQuestion ? (
                  <QuestionEditor courseId={courseId} examId={exam.id} onSaved={() => { setAddingQuestion(false); void loadExamQuestions(exam.id); void loadExams(); }} onCancel={() => setAddingQuestion(false)} />
                ) : (
                  <button
                    onClick={() => { setEditingQuestion(null); setAddingQuestion(true); }}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 py-1"
                  >
                    + Сұрақ қосу
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add exam form */}
        {addingExam ? (
          <form onSubmit={handleAddExam} className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-purple-800">Жаңа емтихан</p>
            <input
              type="text"
              value={examForm.title}
              onChange={(e) => setExamForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Емтихан атауы (мысалы: Финалдық емтихан)"
              className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              autoFocus
            />
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-500">Ұзақтығы (мин):</label>
                <input
                  type="number"
                  value={examForm.duration}
                  onChange={(e) => setExamForm((p) => ({ ...p, duration: Number(e.target.value) }))}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Өту балы (%):</label>
                <input
                  type="number"
                  value={examForm.passScore}
                  onChange={(e) => setExamForm((p) => ({ ...p, passScore: Number(e.target.value) }))}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  min={0}
                  max={100}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingExam}
                className="px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {savingExam ? 'Қосылуда...' : 'Емтихан қосу'}
              </button>
              <button
                type="button"
                onClick={() => setAddingExam(false)}
                className="px-5 py-2 bg-white text-gray-600 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
              >
                Болдырмау
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAddingExam(true)}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-purple-400 hover:text-purple-600 transition text-sm font-medium"
          >
            + Емтихан қосу
          </button>
        )}
      </div>
    </div>
  );
}
