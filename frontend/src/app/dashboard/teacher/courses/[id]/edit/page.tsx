'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

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

interface Question {
  id: string;
  text: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT';
  options: string[] | null;
  answer: string;
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
  const [correctAnswer, setCorrectAnswer] = useState<string | string[]>(existingStep?.content?.correctAnswer ?? '');
  const [explanation, setExplanation] = useState(existingStep?.content?.explanation ?? '');
  const [saving, setSaving] = useState(false);

  const buildContent = () => {
    if (type === 'VIDEO') return { videoUrl, description: videoDesc };
    if (type === 'TEXT') return { html };
    return { question, taskType, options: options.filter(Boolean), correctAnswer, explanation };
  };

  const handleSave = async () => {
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
      toast.error('Сақтау қатесі');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
      <div className="flex gap-3">
        {(['VIDEO', 'TEXT', 'TASK'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {STEP_TYPE_LABELS[t]}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-500">Рет:</label>
          <input
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
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Бейне URL (YouTube embed немесе тікелей)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
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
                onClick={() => setTaskType(k)}
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
              <p className="text-xs font-medium text-gray-600">Жауап нұсқалары:</p>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                    placeholder={`${i + 1}-нұсқа`}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setOptions([...options, ''])}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Нұсқа қосу
              </button>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Дұрыс жауап {taskType === 'multiple_choice' ? '(үтірмен бөліңіз)' : ''}:
            </label>
            <input
              type={taskType === 'number_input' ? 'number' : 'text'}
              value={Array.isArray(correctAnswer) ? correctAnswer.join(', ') : correctAnswer}
              onChange={(e) => {
                if (taskType === 'multiple_choice') {
                  setCorrectAnswer(e.target.value.split(',').map((s) => s.trim()));
                } else {
                  setCorrectAnswer(e.target.value);
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Түсіндірме (міндетті емес):</label>
            <input
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
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? 'Сақталуда...' : existingStep ? 'Жаңарту' : 'Қосу'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-white text-gray-600 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 transition"
        >
          Болдырмау
        </button>
      </div>
    </div>
  );
}

// ─── Lesson Card ──────────────────────────────────────────────────────────────
function LessonCard({
  lesson,
  moduleId,
  onRefresh,
}: {
  lesson: Lesson;
  moduleId: string;
  onRefresh: () => void;
}) {
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
      <div className="flex items-center gap-2 py-1">
        <span className="text-sm font-medium text-gray-700">📖 {lesson.order}. {lesson.title}</span>
        <span className="text-xs text-gray-400 ml-auto">{lesson.steps.length} қадам</span>
      </div>

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
              <span className="text-xs text-gray-400">{step.order}.</span>
              <span className="text-xs font-medium">{STEP_TYPE_LABELS[step.type]}</span>
              <span className="text-xs text-gray-400 flex-1 truncate">
                {step.type === 'TASK' && (step.content.question ?? '')}
                {step.type === 'VIDEO' && (step.content.videoUrl ?? '')}
                {step.type === 'TEXT' && '(мәтін)'}
              </span>
              <div className="hidden group-hover:flex gap-1">
                <button
                  onClick={() => setEditingStep(step)}
                  className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                >
                  Өңдеу
                </button>
                <button
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
          className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 py-1"
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
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-gray-600 text-sm">
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="font-semibold text-gray-800 flex-1">
          {mod.order}. {mod.title}
        </span>
        <span className="text-xs text-gray-400">{mod.lessons.length} сабақ</span>
        <button
          onClick={deleteModule}
          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 hover:bg-red-50 rounded"
        >
          Жою
        </button>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Lessons */}
          {mod.lessons.map((lesson) => (
            <div key={lesson.id} className="group">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <LessonCard lesson={lesson} moduleId={mod.id} onRefresh={onRefresh} />
                </div>
                <button
                  onClick={() => deleteLesson(lesson.id)}
                  className="text-xs text-red-400 hover:text-red-600 mt-2 opacity-0 group-hover:opacity-100 transition"
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
  const [addingExam, setAddingExam] = useState(false);
  const [examForm, setExamForm] = useState({ title: '', duration: 30, passScore: 60 });
  const [savingExam, setSavingExam] = useState(false);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [qForm, setQForm] = useState({ text: '', type: 'SINGLE_CHOICE' as string, options: ['', ''], answer: '' });
  const [savingQ, setSavingQ] = useState(false);

  const loadCourse = useCallback(async () => {
    try {
      const { data } = await api.get(`/courses/${courseId}`);
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
    try {
      const { data } = await api.get(`/courses/${courseId}/exams`);
      setExams(data);
    } catch { /* silent */ }
  }, [courseId]);

  const loadExamQuestions = async (examId: string) => {
    try {
      const { data } = await api.get(`/courses/${courseId}/exams/${examId}`);
      setExamQuestions(data.questions ?? []);
    } catch {
      toast.error('Сұрақтарды жүктеу қатесі');
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

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qForm.text.trim()) { toast.error('Сұрақ мәтінін енгізіңіз'); return; }
    setSavingQ(true);
    try {
      const body: Record<string, any> = { text: qForm.text, type: qForm.type, answer: qForm.answer };
      if (qForm.type !== 'TEXT') {
        body.options = qForm.options.filter(Boolean);
      }
      await api.post(`/courses/${courseId}/exams/${expandedExam}/questions`, body);
      toast.success('Сұрақ қосылды');
      setAddingQuestion(false);
      setQForm({ text: '', type: 'SINGLE_CHOICE', options: ['', ''], answer: '' });
      loadExamQuestions(expandedExam!);
      loadExams();
    } catch {
      toast.error('Сұрақ қосу қатесі');
    } finally {
      setSavingQ(false);
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
        <Link
          href={`/dashboard/courses/${courseId}/learn`}
          className="px-4 py-2 bg-primary-50 text-primary-700 rounded-xl text-sm hover:bg-primary-100 transition flex-shrink-0"
        >
          👁 Алдын ала қарау
        </Link>
      </div>

      {/* Modules */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Курс құрылымы</h2>

        {course.modules.length === 0 && (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400">
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

        {exams.length === 0 && !addingExam && (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400">
            <p className="text-3xl mb-2">📝</p>
            <p className="text-sm">Емтихан жоқ. Алғашқы емтиханды қосыңыз.</p>
          </div>
        )}

        {exams.map((exam) => (
          <div key={exam.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 transition"
              onClick={() => {
                if (expandedExam === exam.id) {
                  setExpandedExam(null);
                } else {
                  setExpandedExam(exam.id);
                  loadExamQuestions(exam.id);
                }
              }}
            >
              <div>
                <p className="font-medium text-gray-900">{exam.title}</p>
                <div className="flex gap-3 text-xs text-gray-500 mt-1">
                  <span>⏱ {exam.duration} мин</span>
                  <span>✅ Өту: {exam.passScore}%</span>
                  <span>❓ {exam._count?.questions ?? 0} сұрақ</span>
                  <span>📊 {exam._count?.attempts ?? 0} талпыныс</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteExam(exam.id, exam.title); }}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  🗑 Жою
                </button>
                <span className="text-gray-400">{expandedExam === exam.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expandedExam === exam.id && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                {/* Existing questions */}
                {examQuestions.length === 0 && !addingQuestion && (
                  <p className="text-gray-400 text-sm text-center py-4">Сұрақтар жоқ</p>
                )}
                {examQuestions.map((q, qi) => (
                  <div key={q.id} className="bg-gray-50 rounded-lg p-3 flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {qi + 1}. {q.text}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {q.type === 'SINGLE_CHOICE' ? '○ Бір жауап' : q.type === 'MULTIPLE_CHOICE' ? '☑ Бірнеше' : 'Аа Мәтін'}
                        {q.options && q.options.length > 0 && ` · ${q.options.length} нұсқа`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="text-red-500 hover:text-red-700 text-xs flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Add question form */}
                {addingQuestion ? (
                  <form onSubmit={handleAddQuestion} className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-semibold text-blue-800">Жаңа сұрақ</p>
                    <textarea
                      value={qForm.text}
                      onChange={(e) => setQForm((p) => ({ ...p, text: e.target.value }))}
                      placeholder="Сұрақ мәтіні"
                      className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex gap-2 items-center">
                      <label className="text-xs text-gray-600">Түрі:</label>
                      <select
                        value={qForm.type}
                        onChange={(e) => setQForm((p) => ({ ...p, type: e.target.value }))}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      >
                        <option value="SINGLE_CHOICE">Бір жауап</option>
                        <option value="MULTIPLE_CHOICE">Бірнеше жауап</option>
                        <option value="TEXT">Мәтін жауабы</option>
                      </select>
                    </div>

                    {qForm.type !== 'TEXT' && (
                      <div className="space-y-1">
                        <label className="text-xs text-gray-600">Нұсқалар:</label>
                        {qForm.options.map((opt, i) => (
                          <div key={i} className="flex gap-1 items-center">
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const next = [...qForm.options];
                                next[i] = e.target.value;
                                setQForm((p) => ({ ...p, options: next }));
                              }}
                              placeholder={`Нұсқа ${i + 1}`}
                              className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                            />
                            {qForm.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => setQForm((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                                className="text-red-400 text-xs"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setQForm((p) => ({ ...p, options: [...p.options, ''] }))}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          + Нұсқа қосу
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-gray-600">Дұрыс жауап:</label>
                      <input
                        type="text"
                        value={qForm.answer}
                        onChange={(e) => setQForm((p) => ({ ...p, answer: e.target.value }))}
                        placeholder="Дұрыс жауапты жазыңыз"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm mt-1"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={savingQ}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingQ ? 'Қосылуда...' : 'Сұрақты қосу'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingQuestion(false)}
                        className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
                      >
                        Болдырмау
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setAddingQuestion(true)}
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
