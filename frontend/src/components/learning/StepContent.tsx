'use client';

import { useState } from 'react';
import DOMPurify from 'dompurify';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export interface LearningStep {
  id: string;
  type: 'VIDEO' | 'TEXT' | 'TASK';
  order: number;
  content: Record<string, any>;
}

export default function StepContent({ step, onComplete }: { step: LearningStep; onComplete: () => Promise<void> | void }) {
  const [saving, setSaving] = useState(false);
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try { await onComplete(); }
    catch { toast.error('Прогресс сақталмады. Қайталап көріңіз.'); }
    finally { setSaving(false); }
  };
  return (
    <div aria-busy={saving}>
      <fieldset disabled={saving} className="min-w-0">
        {step.type === 'VIDEO' && <VideoStep content={step.content} onComplete={finish} />}
        {step.type === 'TEXT' && <TextStep content={step.content} onComplete={finish} />}
        {step.type === 'TASK' && <TaskStep stepId={step.id} content={step.content} onComplete={finish} />}
      </fieldset>
      {saving && <p role="status" className="mt-2 text-sm text-gray-500">Прогресс сақталуда...</p>}
    </div>
  );
}
// ─── Video Step ───────────────────────────────────────────────────────────────
function VideoStep({ content, onComplete }: { content: Record<string, any>; onComplete: () => Promise<void> | void }) {
  return (
    <div className="space-y-4">
      <div className="aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          src={content.videoUrl}
          title="Сабақ бейнесі"
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {content.description && (
        <p className="text-gray-600 text-sm">{content.description}</p>
      )}
      <button
        onClick={onComplete}
        className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
      >
        ✅ Бейнені қарадым
      </button>
    </div>
  );
}

// ─── Text Step ────────────────────────────────────────────────────────────────
function TextStep({ content, onComplete }: { content: Record<string, any>; onComplete: () => Promise<void> | void }) {
  return (
    <div className="space-y-4">
      <div
        className="prose max-w-none bg-white rounded-xl p-6 border border-gray-100 shadow-sm"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content.html ?? '', { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target'] }) }}
      />
      <button
        onClick={onComplete}
        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
      >
        ✅ Оқыдым
      </button>
    </div>
  );
}

// ─── Task Step ────────────────────────────────────────────────────────────────
function TaskStep({
  stepId,
  content,
  onComplete,
}: {
  stepId: string;
  content: Record<string, any>;
  onComplete: () => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<string | string[]>(content.taskType === 'multiple_choice' ? [] : '');
  const [textInput, setTextInput] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [result, setResult] = useState<{ isCorrect: boolean; score: number; explanation?: string; correctAnswer?: any } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    let answer: Record<string, any> = {};
    if (content.taskType === 'single_choice') answer = { selected };
    else if (content.taskType === 'multiple_choice') answer = { selected };
    else if (content.taskType === 'text_input') answer = { text: textInput };
    else if (content.taskType === 'number_input') answer = { value: numberInput };

    setSubmitting(true);
    try {
      const { data } = await api.post(`/steps/${stepId}/submit`, { answer });
      setResult(data);
      if (data.isCorrect) await onComplete();
    } catch {
      toast.error('Жіберу қатесі');
    } finally {
      setSubmitting(false);
    }
  };

  const resetTask = () => {
    setResult(null);
    setSelected(content.taskType === 'multiple_choice' ? [] : '');
    setTextInput('');
    setNumberInput('');
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-5">
      <p className="text-lg font-semibold text-gray-800">{content.question}</p>

      {/* Single choice */}
      {content.taskType === 'single_choice' && (
        <div className="space-y-2">
          {(content.options ?? []).map((opt: string) => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selected === opt
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-primary-300'
              }`}
            >
              <input
                type="radio"
                name={`task-${stepId}`}
                value={opt}
                checked={selected === opt}
                onChange={() => setSelected(opt)}
                disabled={!!result}
                className="accent-primary-600"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {/* Multiple choice */}
      {content.taskType === 'multiple_choice' && (
        <div className="space-y-2">
          {(content.options ?? []).map((opt: string) => {
            const arr = Array.isArray(selected) ? selected : [];
            const checked = arr.includes(opt);
            return (
              <label
                key={opt}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  checked ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const a = Array.isArray(selected) ? [...selected] : [];
                    setSelected(checked ? a.filter((x) => x !== opt) : [...a, opt]);
                  }}
                  disabled={!!result}
                  className="accent-primary-600"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Text input */}
      {content.taskType === 'text_input' && (
        <input
          type="text"
          value={textInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextInput(e.target.value)}
          disabled={!!result}
          placeholder="Жауапты енгізіңіз..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}

      {/* Number input */}
      {content.taskType === 'number_input' && (
        <input
          type="number"
          value={numberInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumberInput(e.target.value)}
          disabled={!!result}
          placeholder="Санды енгізіңіз..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}

      {/* Submit */}
      {!result && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Тексерілуде...' : 'Жауапты жіберу'}
        </button>
      )}

      {/* Result */}
      {result && (
        <div
          className={`rounded-xl p-4 border ${
            result.isCorrect
              ? 'bg-green-50 border-green-300 text-green-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
        >
          <p className="font-bold text-base mb-1">
            {result.isCorrect ? '✅ Дұрыс!' : '❌ Қате'}
          </p>
          {!result.isCorrect && result.correctAnswer && (
            <p className="text-sm">Дұрыс жауап: <strong>{result.correctAnswer}</strong></p>
          )}
          {result.explanation && (
            <p className="text-sm mt-1 text-gray-700">{result.explanation}</p>
          )}
          {result.isCorrect && (
            <button onClick={onComplete} className="mt-3 text-sm underline">
              Прогресті сақтау
            </button>
          )}
          {!result.isCorrect && (
            <button
              onClick={resetTask}
              className="mt-3 px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
            >
              Қайталау
            </button>
          )}
        </div>
      )}
    </div>
  );
}
