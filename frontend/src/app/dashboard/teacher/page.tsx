'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Course {
  id: string;
  title: string;
  description?: string;
  _count: { lessons: number; exams: number };
}

interface Lesson {
  id: string;
  title: string;
  content: string;
  order: number;
}

interface Question {
  id: string;
  text: string;
  type: string;
  options?: string[];
  answer: string;
}

interface Exam {
  id: string;
  title: string;
  duration: number;
  passScore: number;
  questions?: Question[];
}

type Tab = 'courses' | 'lessons' | 'exams' | 'results';

export default function TeacherDashboardPage() {
  const [tab, setTab] = useState<Tab>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [examResults, setExamResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [courseForm, setCourseForm] = useState({ title: '', description: '' });
  const [lessonForm, setLessonForm] = useState({ title: '', content: '', order: 1 });
  const [examForm, setExamForm] = useState({ title: '', duration: 60, passScore: 60 });
  const [questionForm, setQuestionForm] = useState({ text: '', type: 'SINGLE_CHOICE', options: '', answer: '' });
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/courses?limit=100')
      .then(({ data }) => setCourses(data.data ?? data))
      .catch(() => toast.error('Жуктеу катесі'))
      .finally(() => setLoading(false));
  }, []);

  const loadLessons = async (course: Course) => {
    setSelectedCourse(course);
    const { data } = await api.get(`/courses/${course.id}/lessons`);
    setLessons(data);
    setLessonForm((p) => ({ ...p, order: data.length + 1 }));
    setTab('lessons');
  };

  const loadExams = async (course: Course) => {
    setSelectedCourse(course);
    const { data } = await api.get(`/courses/${course.id}/exams`);
    setExams(data);
    setTab('exams');
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post('/courses', courseForm);
      setCourses((prev) => [...prev, data]);
      setCourseForm({ title: '', description: '' });
      toast.success('Курс жасалды!');
    } catch { toast.error('Курс жасау катесі'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm('Курсты жоюды растайсыз ба?')) return;
    try {
      await api.delete(`/courses/${id}`);
      setCourses((prev) => prev.filter((c) => c.id !== id));
      toast.success('Курс жойылды');
    } catch { toast.error('Жою катесі'); }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/courses/${selectedCourse.id}/lessons`, lessonForm);
      setLessons((prev) => [...prev, data]);
      setLessonForm({ title: '', content: '', order: lessons.length + 2 });
      toast.success('Сабак жасалды!');
    } catch { toast.error('Сабак жасау катесі'); }
    finally { setSubmitting(false); }
  };

  const handleUpdateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson || !selectedCourse) return;
    setSubmitting(true);
    try {
      const { data } = await api.patch(`/courses/${selectedCourse.id}/lessons/${editingLesson.id}`, {
        title: editingLesson.title, content: editingLesson.content, order: editingLesson.order,
      });
      setLessons((prev) => prev.map((l) => l.id === data.id ? data : l));
      setEditingLesson(null);
      toast.success('Сабак жангартылды');
    } catch { toast.error('Жангарту катесі'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteLesson = async (id: string) => {
    if (!selectedCourse || !confirm('Сабакты жоюды растайсыз ба?')) return;
    try {
      await api.delete(`/courses/${selectedCourse.id}/lessons/${id}`);
      setLessons((prev) => prev.filter((l) => l.id !== id));
      toast.success('Сабак жойылды');
    } catch { toast.error('Жою катесі'); }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/courses/${selectedCourse.id}/exams`, { ...examForm, questions: [] });
      setExams((prev) => [...prev, data]);
      setExamForm({ title: '', duration: 60, passScore: 60 });
      toast.success('Емтихан жасалды!');
    } catch { toast.error('Емтихан жасау катесі'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteExam = async (id: string) => {
    if (!selectedCourse || !confirm('Емтиханды жоюды растайсыз ба?')) return;
    try {
      await api.delete(`/courses/${selectedCourse.id}/exams/${id}`);
      setExams((prev) => prev.filter((ex) => ex.id !== id));
      if (selectedExam?.id === id) setSelectedExam(null);
      toast.success('Емтихан жойылды');
    } catch { toast.error('Жою катесі'); }
  };

  const loadExamQuestions = async (exam: Exam) => {
    const { data } = await api.get(`/courses/${selectedCourse!.id}/exams/${exam.id}`);
    setSelectedExam(data);
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !selectedCourse) return;
    setSubmitting(true);
    const opts = questionForm.options.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      const { data } = await api.post(`/courses/${selectedCourse.id}/exams/${selectedExam.id}/questions`, {
        text: questionForm.text,
        type: questionForm.type,
        options: opts.length > 0 ? opts : undefined,
        answer: questionForm.answer,
      });
      setSelectedExam((prev) => prev ? { ...prev, questions: [...(prev.questions || []), data] } : prev);
      setQuestionForm({ text: '', type: 'SINGLE_CHOICE', options: '', answer: '' });
      toast.success('Сурак косылды!');
    } catch { toast.error('Сурак косу катесі'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!selectedExam || !selectedCourse || !confirm('Суракты жоюды растайсыз ба?')) return;
    try {
      await api.delete(`/courses/${selectedCourse.id}/exams/${selectedExam.id}/questions/${questionId}`);
      setSelectedExam((prev) => prev
        ? { ...prev, questions: prev.questions?.filter((q) => q.id !== questionId) }
        : prev);
      toast.success('Сурак жойылды');
    } catch { toast.error('Жою катесі'); }
  };

  const handleViewResults = async (exam: Exam) => {
    setSelectedExam(exam);
    const { data } = await api.get(`/attempts/exam/${exam.id}/results`);
    setExamResults(data);
    setTab('results');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mugalim paneli</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {([
          { key: 'courses', label: 'Kurstar' },
          { key: 'lessons', label: selectedCourse ? `Sabaktar — ${selectedCourse.title}` : 'Sabaktar' },
          { key: 'exams', label: selectedCourse ? `Emtihandar — ${selectedCourse.title}` : 'Emtihandar' },
          { key: 'results', label: selectedExam ? `Natijeler — ${selectedExam.title}` : 'Natijeler' },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* COURSES TAB */}
      {tab === 'courses' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Zhana kurs</h2>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Atauы</label>
                <input className="input" value={courseForm.title}
                  onChange={(e) => setCourseForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Kurs atauы..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sipattama</label>
                <textarea className="input resize-none" rows={3} value={courseForm.description}
                  onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Kurs turaly..." />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Zhasalyuda...' : '+ Kurs zhasau'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 card">
            <h2 className="text-lg font-semibold mb-4">Menin kurstarym</h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : courses.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Kurs zhok</p>
            ) : (
              <div className="space-y-3">
                {courses.map((course) => (
                  <div key={course.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{course.title}</h3>
                        {course.description && <p className="text-sm text-gray-500 mt-1">{course.description}</p>}
                        <div className="flex gap-4 mt-2 text-xs text-gray-400">
                          <span>{course._count?.lessons ?? 0} sabak</span>
                          <span>{course._count?.exams ?? 0} emtihan</span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => loadLessons(course)} className="text-primary-600 hover:text-primary-800 text-sm font-medium">Sabaktar</button>
                        <button onClick={() => loadExams(course)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Emtihandar</button>
                        <button onClick={() => handleDeleteCourse(course.id)} className="text-red-500 hover:text-red-700 text-sm">Zhoy</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LESSONS TAB */}
      {tab === 'lessons' && selectedCourse && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">{editingLesson ? 'Sabakty ongdeu' : 'Zhana sabak'}</h2>
            <form onSubmit={editingLesson ? handleUpdateLesson : handleCreateLesson} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Takhyrыp</label>
                <input className="input"
                  value={editingLesson ? editingLesson.title : lessonForm.title}
                  onChange={(e) => editingLesson
                    ? setEditingLesson((p) => p ? { ...p, title: e.target.value } : p)
                    : setLessonForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Sabak takhyrybы" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mazmuny</label>
                <textarea className="input resize-none" rows={6}
                  value={editingLesson ? editingLesson.content : lessonForm.content}
                  onChange={(e) => editingLesson
                    ? setEditingLesson((p) => p ? { ...p, content: e.target.value } : p)
                    : setLessonForm((p) => ({ ...p, content: e.target.value }))}
                  placeholder="Sabak mazmuny..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Retlik nomer</label>
                <input type="number" min={1} className="input"
                  value={editingLesson ? editingLesson.order : lessonForm.order}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    editingLesson ? setEditingLesson((p) => p ? { ...p, order: v } : p)
                      : setLessonForm((p) => ({ ...p, order: v }));
                  }} required />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? 'Zhasalyuda...' : editingLesson ? 'Zhangartu' : '+ Sabak zhasau'}
                </button>
                {editingLesson && (
                  <button type="button" onClick={() => setEditingLesson(null)} className="btn-secondary">Boldyrмau</button>
                )}
              </div>
            </form>
          </div>

          <div className="lg:col-span-2 card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Sabaktar tizimi</h2>
              <button onClick={() => setTab('courses')} className="text-sm text-gray-500 hover:text-gray-700">← Artka</button>
            </div>
            {lessons.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Sabak zhok</p>
            ) : (
              <div className="space-y-3">
                {[...lessons].sort((a, b) => a.order - b.order).map((lesson) => (
                  <div key={lesson.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900"><span className="text-primary-600 mr-2">{lesson.order}.</span>{lesson.title}</p>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{lesson.content}</p>
                      </div>
                      <div className="flex gap-2 ml-4 flex-shrink-0">
                        <button onClick={() => setEditingLesson(lesson)} className="text-blue-600 hover:text-blue-800 text-sm">Ongdeu</button>
                        <button onClick={() => handleDeleteLesson(lesson.id)} className="text-red-500 hover:text-red-700 text-sm">Zhoy</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXAMS TAB */}
      {tab === 'exams' && selectedCourse && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="card">
            {!selectedExam ? (
              <>
                <h2 className="text-lg font-semibold mb-4">Zhana emtikhan</h2>
                <form onSubmit={handleCreateExam} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Atauы</label>
                    <input className="input" value={examForm.title}
                      onChange={(e) => setExamForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Emtikhan atauы" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Uakyt (min)</label>
                    <input type="number" min={1} className="input" value={examForm.duration}
                      onChange={(e) => setExamForm((p) => ({ ...p, duration: parseInt(e.target.value) }))} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Otu baly (%)</label>
                    <input type="number" min={0} max={100} className="input" value={examForm.passScore}
                      onChange={(e) => setExamForm((p) => ({ ...p, passScore: parseInt(e.target.value) }))} required />
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={submitting}>
                    {submitting ? 'Zhasalyuda...' : '+ Emtikhan zhasau'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Surак kosu</h2>
                  <button onClick={() => setSelectedExam(null)} className="text-sm text-gray-500">← Artka</button>
                </div>
                <form onSubmit={handleAddQuestion} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Surак mатini</label>
                    <textarea className="input resize-none" rows={3} value={questionForm.text}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, text: e.target.value }))}
                      placeholder="Surак mатini..." required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Turі</label>
                    <select className="input" value={questionForm.type}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, type: e.target.value }))}>
                      <option value="SINGLE_CHOICE">Bir dyrys zhaup</option>
                      <option value="MULTIPLE_CHOICE">Birneshe dyrys zhaup</option>
                      <option value="TEXT">Erkin zhaup</option>
                    </select>
                  </div>
                  {(questionForm.type === 'SINGLE_CHOICE' || questionForm.type === 'MULTIPLE_CHOICE') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nuskalary (ar zhol — bir nуska)</label>
                      <textarea className="input resize-none" rows={4} value={questionForm.options}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, options: e.target.value }))}
                        placeholder={'A nuska\nB nuska\nV nuska'} />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {questionForm.type === 'MULTIPLE_CHOICE' ? 'Dyrys zhauaрtar (utir arkyly)' : 'Dyrys zhaup'}
                    </label>
                    <input className="input" value={questionForm.answer}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, answer: e.target.value }))}
                      placeholder={questionForm.type === 'MULTIPLE_CHOICE' ? 'A nuska,V nuska' : 'Dyrys zhaup'}
                      required />
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={submitting}>
                    {submitting ? 'Kosylyuda...' : '+ Surак kosu'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="lg:col-span-2 card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {selectedExam ? `${selectedExam.title} — Surаktar` : 'Emtikhandar'}
              </h2>
              <button onClick={() => { setTab('courses'); setSelectedExam(null); }} className="text-sm text-gray-500 hover:text-gray-700">← Artka</button>
            </div>

            {!selectedExam ? (
              exams.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Emtikhan zhok</p>
              ) : (
                <div className="space-y-3">
                  {exams.map((exam) => (
                    <div key={exam.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start flex-wrap gap-2">
                        <div>
                          <h3 className="font-medium text-gray-900">{exam.title}</h3>
                          <div className="flex gap-4 mt-1 text-xs text-gray-400">
                            <span>{exam.duration} min</span>
                            <span>Otu: {exam.passScore}%</span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => loadExamQuestions(exam)} className="text-primary-600 hover:text-primary-800 text-sm font-medium">Surаktar</button>
                          <button onClick={() => handleViewResults(exam)} className="text-green-600 hover:text-green-800 text-sm font-medium">Natijeler</button>
                          <button onClick={() => handleDeleteExam(exam.id)} className="text-red-500 hover:text-red-700 text-sm">Zhoy</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div>
                {(!selectedExam.questions || selectedExam.questions.length === 0) ? (
                  <p className="text-gray-400 text-center py-8">Surаk zhok — sol zhaktan kosynyz</p>
                ) : (
                  <div className="space-y-3">
                    {selectedExam.questions.map((q, idx) => (
                      <div key={q.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900"><span className="text-primary-600 mr-2">{idx + 1}.</span>{q.text}</p>
                            <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-2">
                              <span className="bg-gray-100 px-2 py-0.5 rounded">{q.type}</span>
                              {q.options && q.options.length > 0 && <span>Nuskalary: {q.options.join(', ')}</span>}
                              <span className="text-green-600 font-medium">Zhaup: {q.answer}</span>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteQuestion(q.id)} className="text-red-500 hover:text-red-700 text-sm ml-4 flex-shrink-0">Zhoy</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTS TAB */}
      {tab === 'results' && selectedExam && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">{selectedExam.title} — Student natijelerі</h2>
            <button onClick={() => { setTab('exams'); setExamResults([]); }} className="text-sm text-gray-500 hover:text-gray-700">← Artka</button>
          </div>
          {examResults.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Natije zhok</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="pb-3 text-gray-500 font-medium">Student</th>
                    <th className="pb-3 text-gray-500 font-medium">Ball</th>
                    <th className="pb-3 text-gray-500 font-medium">Trust Score</th>
                    <th className="pb-3 text-gray-500 font-medium">Kuy</th>
                    <th className="pb-3 text-gray-500 font-medium">Is-sharalar</th>
                    <th className="pb-3 text-gray-500 font-medium">Uakyty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {examResults.map((r: any) => (
                    <tr key={r.id}>
                      <td className="py-3">
                        <p className="font-medium text-gray-900">{r.user.name}</p>
                        <p className="text-xs text-gray-400">{r.user.email}</p>
                      </td>
                      <td className={`py-3 font-bold ${(r.score ?? 0) >= selectedExam.passScore ? 'text-green-600' : 'text-red-600'}`}>
                        {r.score ?? '---'}%
                      </td>
                      <td className={`py-3 font-medium ${r.trustScore >= 80 ? 'text-green-600' : r.trustScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {r.trustScore}/100
                      </td>
                      <td className="py-3">
                        {r.status === 'FINISHED'
                          ? <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">OK</span>
                          : <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">Belgilengen</span>}
                      </td>
                      <td className="py-3 text-gray-500">{r._count?.events ?? 0}</td>
                      <td className="py-3 text-xs text-gray-400">
                        {r.finishedAt ? new Date(r.finishedAt).toLocaleString('kk-KZ') : '---'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
