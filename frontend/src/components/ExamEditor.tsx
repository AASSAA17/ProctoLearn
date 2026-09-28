'use client';

import { useId, useState } from 'react';
import api from '@/lib/api';

export interface EditableExam {
  id: string;
  title: string;
  duration: number;
  passScore: number;
}

export interface EditableQuestion {
  id: string;
  text: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT';
  options: string[] | null;
  answer: string;
}

export function ExamSettings({ courseId, exam, onSaved, onCancel }: {
  courseId: string;
  exam: EditableExam;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(exam.title);
  const [duration, setDuration] = useState(exam.duration);
  const [passScore, setPassScore] = useState(exam.passScore);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!title.trim() || !Number.isInteger(duration) || duration < 1 || duration > 1440 ||
        !Number.isInteger(passScore) || passScore < 0 || passScore > 100) {
      setError('Атауды, 1–1440 минут ұзақтығын және 0–100% өту балын енгізіңіз.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/courses/${courseId}/exams/${exam.id}`, { title: title.trim(), duration, passScore });
      onSaved();
    } catch {
      setError('Емтихан сақталмады. Деректер сақталды, қайта көріңіз.');
    } finally {
      setSaving(false);
    }
  };

  return <form aria-label="Емтихан параметрлері" onSubmit={save} className="rounded-lg border border-purple-200 bg-purple-50 p-4">
    <fieldset disabled={saving} className="min-w-0 space-y-3">
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <label className="block text-sm text-gray-800">Емтихан атауы
        <input required value={title} onChange={event => setTitle(event.target.value)} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-gray-800">Ұзақтығы (мин)
          <input required type="number" min={1} max={1440} value={duration} onChange={event => setDuration(Number(event.target.value))} className="mt-1 block w-24 rounded border border-gray-300 bg-white px-3 py-2" />
        </label>
        <label className="text-sm text-gray-800">Өту балы (%)
          <input required type="number" min={0} max={100} value={passScore} onChange={event => setPassScore(Number(event.target.value))} className="mt-1 block w-24 rounded border border-gray-300 bg-white px-3 py-2" />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-purple-700 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Сақталуда...' : 'Сақтау'}</button>
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800">Болдырмау</button>
      </div>
    </fieldset>
  </form>;
}

function initialSelected(question?: EditableQuestion): number[] {
  if (!question?.options?.length) return [];
  if (question.type === 'SINGLE_CHOICE') return question.options.flatMap((option, index) => option === question.answer ? [index] : []);
  if (question.type !== 'MULTIPLE_CHOICE') return [];
  let values: string[];
  try {
    const parsed: unknown = JSON.parse(question.answer);
    values = Array.isArray(parsed) && parsed.every(value => typeof value === 'string') ? parsed : question.answer.split(',');
  } catch {
    values = question.answer.split(',');
  }
  return question.options.flatMap((option, index) => values.some(value => value.trim() === option) ? [index] : []);
}

export function QuestionEditor({ courseId, examId, question, onSaved, onCancel }: {
  courseId: string;
  examId: string;
  question?: EditableQuestion;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(question?.text ?? '');
  const [type, setType] = useState<EditableQuestion['type']>(question?.type ?? 'SINGLE_CHOICE');
  const [options, setOptions] = useState<string[]>(question?.options?.length ? question.options : ['', '']);
  const [selected, setSelected] = useState<number[]>(() => initialSelected(question));
  const [textAnswer, setTextAnswer] = useState(question?.type === 'TEXT' ? question.answer : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const choiceGroup = useId();

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    const choices = options.map(option => option.trim());
    if (!text.trim()) { setError('Сұрақ мәтінін енгізіңіз.'); return; }
    if (type !== 'TEXT' && (choices.length < 2 || choices.some(option => !option) || new Set(choices).size !== choices.length)) {
      setError('Кемінде екі бос емес, қайталанбайтын нұсқа енгізіңіз.'); return;
    }
    if (type !== 'TEXT' && !selected.length) { setError('Дұрыс жауапты белгілеңіз.'); return; }
    if (type === 'TEXT' && !textAnswer.trim()) { setError('Дұрыс жауапты енгізіңіз.'); return; }
    const answer = type === 'TEXT' ? textAnswer.trim() : type === 'SINGLE_CHOICE' ? choices[selected[0]] : JSON.stringify(selected.map(index => choices[index]));
    const body = { text: text.trim(), type, options: type === 'TEXT' ? [] : choices, answer };
    setSaving(true);
    try {
      const endpoint = `/courses/${courseId}/exams/${examId}/questions`;
      if (question) await api.patch(`${endpoint}/${question.id}`, body);
      else await api.post(endpoint, body);
      onSaved();
    } catch {
      setError('Сұрақ сақталмады. Деректер сақталды, қайта көріңіз.');
    } finally {
      setSaving(false);
    }
  };

  return <form aria-label="Сұрақ редакторы" onSubmit={save} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
    <fieldset disabled={saving} className="min-w-0 space-y-3">
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <label className="block text-sm text-gray-800">Сұрақ мәтіні
        <textarea required maxLength={20000} rows={2} value={text} onChange={event => setText(event.target.value)} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
      </label>
      <label className="block text-sm text-gray-800">Сұрақ түрі
        <select value={type} onChange={event => { setType(event.target.value as EditableQuestion['type']); if (event.target.value === 'SINGLE_CHOICE') setSelected(previous => previous.slice(0, 1)); }} className="mt-1 block rounded border border-gray-300 bg-white px-3 py-2">
          <option value="SINGLE_CHOICE">Бір жауап</option>
          <option value="MULTIPLE_CHOICE">Бірнеше жауап</option>
          <option value="TEXT">Мәтін жауабы</option>
        </select>
      </label>
      {type === 'TEXT' ? <label className="block text-sm text-gray-800">Дұрыс жауап
        <input required maxLength={10000} value={textAnswer} onChange={event => setTextAnswer(event.target.value)} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
      </label> : <div className="space-y-2">
        <p className="text-sm text-gray-800">Нұсқаларды енгізіп, дұрыс жауапты белгілеңіз.</p>
        {options.map((option, index) => <div key={index} className="flex min-w-0 items-center gap-2">
          <input type={type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'} name={choiceGroup} checked={selected.includes(index)} aria-label={`Дұрыс жауап: ${index + 1}-нұсқа`} onChange={event => setSelected(type === 'SINGLE_CHOICE' ? [index] : event.target.checked ? [...selected, index] : selected.filter(item => item !== index))} />
          <input required maxLength={10000} aria-label={`Жауап нұсқасы ${index + 1}`} value={option} onChange={event => setOptions(previous => previous.map((value, item) => item === index ? event.target.value : value))} className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2" />
          <button type="button" aria-label={`Нұсқаны жою: ${index + 1}`} disabled={options.length <= 2} onClick={() => { setOptions(previous => previous.filter((_, item) => item !== index)); setSelected(previous => previous.filter(item => item !== index).map(item => item > index ? item - 1 : item)); }} className="text-red-800 disabled:opacity-40">✕</button>
        </div>)}
        <button type="button" onClick={() => setOptions(previous => [...previous, ''])} className="text-sm text-blue-800 underline">+ Нұсқа қосу</button>
      </div>}
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Сақталуда...' : question ? 'Сұрақты жаңарту' : 'Сұрақты қосу'}</button>
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800">Болдырмау</button>
      </div>
    </fieldset>
  </form>;
}
