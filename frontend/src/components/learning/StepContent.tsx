'use client';

import { useId, useState } from 'react';
import DOMPurify from 'dompurify';
import api from '@/lib/api';
import { classifyLearningMedia } from '@/lib/learning-media';

export interface LearningStep {
  id: string;
  type: 'VIDEO' | 'TEXT' | 'TASK';
  order: number;
  content: Record<string, any>;
}

type StepContentProps = {
  step: LearningStep;
  onComplete?: () => Promise<void> | void;
  preview?: boolean;
  completed?: boolean;
};

export default function StepContent({ step, onComplete, preview = false, completed = false }: StepContentProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const finish = async (): Promise<boolean> => {
    if (preview || saving || saved || completed || !onComplete) return saved || completed;
    setSaving(true);
    setSaveError(false);
    try {
      await onComplete();
      setSaved(true);
      return true;
    } catch {
      setSaveError(true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div aria-busy={saving} className="min-w-0">
      {preview && (
        <p role="note" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Алдын ала қарау: жауаптар бағаланбайды және прогреске сақталмайды.
        </p>
      )}
      {step.type === 'VIDEO' && <VideoStep content={step.content} onComplete={finish} disabled={saving} saved={saved || completed} preview={preview} />}
      {step.type === 'TEXT' && <TextStep content={step.content} onComplete={finish} disabled={saving} saved={saved || completed} preview={preview} />}
      {step.type === 'TASK' && <TaskStep stepId={step.id} content={step.content} onComplete={finish} disabled={saving} preview={preview} completed={completed} />}

      <div aria-live="polite" aria-atomic="true">
        {saving && <p role="status" className="mt-3 text-sm text-slate-600">Прогресс сақталуда...</p>}
        {saved && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">✓ Прогресс сақталды</p>}
        {saveError && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>Жауап қабылданды, бірақ прогресс сақталмады. Байланысты тексеріп, қайта сақтаңыз.</p>
            <button type="button" onClick={() => { void finish(); }} className="mt-3 min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2 font-semibold hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
              Қайта сақтау
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompletionButton({ children, onComplete, disabled }: { children: React.ReactNode; onComplete: () => Promise<boolean>; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => { void onComplete(); }}
      disabled={disabled}
      className="min-h-11 rounded-xl bg-emerald-600 px-6 py-2.5 font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function VideoStep({ content, onComplete, disabled, saved, preview }: { content: Record<string, any>; onComplete: () => Promise<boolean>; disabled: boolean; saved: boolean; preview: boolean }) {
  const media = classifyLearningMedia(content.videoUrl);
  return (
    <div className="min-w-0 space-y-4">
      {media.kind === 'direct' && (
        <video controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" aria-label="Сабақ бейнесі">
          <source src={media.url} />
          Браузеріңіз бұл бейнені ойната алмайды.
        </video>
      )}
      {media.kind === 'embed' && (
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <iframe
            src={media.url}
            title="Сабақ бейнесі"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}
      {media.kind === 'link' && (
        <a href={media.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 font-semibold text-primary-800 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2">
          <span className="min-w-0 break-words">Бейнені жаңа қойындыда ашу</span><span aria-hidden="true">↗</span>
        </a>
      )}
      {media.kind === 'invalid' && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Бейне мекенжайы қолжетімсіз. Сабақ мәтінін жалғастырып оқыңыз.</p>}
      {content.description && <p className="break-words text-sm leading-6 text-slate-600">{content.description}</p>}
      {!preview && !saved && <CompletionButton onComplete={onComplete} disabled={disabled}>Бейнені қарадым</CompletionButton>}
    </div>
  );
}

function TextStep({ content, onComplete, disabled, saved, preview }: { content: Record<string, any>; onComplete: () => Promise<boolean>; disabled: boolean; saved: boolean; preview: boolean }) {
  const safeHtml = DOMPurify.sanitize(typeof content.html === 'string' ? content.html : '', {
    FORBID_TAGS: ['iframe', 'object', 'embed'],
  });
  return (
    <div className="min-w-0 space-y-4">
      <div
        className="prose max-w-none overflow-hidden break-words rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 [&_a]:break-all [&_code]:break-words [&_img]:h-auto [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
      {!preview && !saved && <CompletionButton onComplete={onComplete} disabled={disabled}>Оқып шықтым</CompletionButton>}
    </div>
  );
}

type TaskResult = { isCorrect: boolean; score: number; explanation?: string | null };

function TaskStep({ stepId, content, onComplete, disabled, preview, completed }: { stepId: string; content: Record<string, any>; onComplete: () => Promise<boolean>; disabled: boolean; preview: boolean; completed: boolean }) {
  const questionId = useId();
  const inputId = useId();
  const [selected, setSelected] = useState<string | string[]>(content.taskType === 'multiple_choice' ? [] : '');
  const [textInput, setTextInput] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [result, setResult] = useState<TaskResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const hasAnswer = content.taskType === 'single_choice'
    ? typeof selected === 'string' && selected.length > 0
    : content.taskType === 'multiple_choice'
      ? Array.isArray(selected) && selected.length > 0
      : content.taskType === 'text_input'
        ? textInput.trim().length > 0
        : content.taskType === 'number_input' && numberInput.trim().length > 0;

  const handleSubmit = async () => {
    if (preview || completed || disabled || submitting || !hasAnswer) return;
    let answer: Record<string, any> = {};
    if (content.taskType === 'single_choice' || content.taskType === 'multiple_choice') answer = { selected };
    else if (content.taskType === 'text_input') answer = { text: textInput };
    else if (content.taskType === 'number_input') answer = { value: numberInput };

    setSubmitting(true);
    setSubmitError(false);
    try {
      const { data } = await api.post<TaskResult>(`/steps/${stepId}/submit`, { answer });
      setResult(data);
      if (data.isCorrect) await onComplete();
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const resetTask = () => {
    setResult(null);
    setSubmitError(false);
    setSelected(content.taskType === 'multiple_choice' ? [] : '');
    setTextInput('');
    setNumberInput('');
  };

  return (
    <fieldset disabled={preview || completed || disabled || submitting} aria-describedby={submitError ? `${questionId}-error` : undefined} className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <legend id={questionId} className="max-w-full px-1 text-lg font-semibold leading-7 text-slate-900">{content.question}</legend>

      {content.taskType === 'single_choice' && (
        <div className="space-y-2" role="radiogroup" aria-labelledby={questionId}>
          {(content.options ?? []).map((opt: string) => (
            <label key={opt} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${selected === opt ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-primary-300'}`}>
              <input type="radio" name={`task-${stepId}`} value={opt} checked={selected === opt} onChange={() => setSelected(opt)} disabled={!!result} className="h-5 w-5 shrink-0 accent-primary-600" />
              <span className="min-w-0 break-words">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {content.taskType === 'multiple_choice' && (
        <div className="space-y-2" aria-labelledby={questionId}>
          {(content.options ?? []).map((opt: string) => {
            const values = Array.isArray(selected) ? selected : [];
            const checked = values.includes(opt);
            return (
              <label key={opt} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${checked ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-primary-300'}`}>
                <input type="checkbox" checked={checked} onChange={() => setSelected(checked ? values.filter((value) => value !== opt) : [...values, opt])} disabled={!!result} className="h-5 w-5 shrink-0 accent-primary-600" />
                <span className="min-w-0 break-words">{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {content.taskType === 'text_input' && (
        <div>
          <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-slate-700">Жауабыңыз</label>
          <input id={inputId} type="text" value={textInput} onChange={(event) => setTextInput(event.target.value)} disabled={!!result} autoComplete="off" className="min-h-11 w-full rounded-lg border border-slate-300 px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2" />
        </div>
      )}

      {content.taskType === 'number_input' && (
        <div>
          <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-slate-700">Сандық жауабыңыз</label>
          <input id={inputId} type="number" inputMode="decimal" value={numberInput} onChange={(event) => setNumberInput(event.target.value)} disabled={!!result} className="min-h-11 w-full rounded-lg border border-slate-300 px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2" />
        </div>
      )}

      {!preview && !completed && !result && (
        <button type="button" onClick={() => { void handleSubmit(); }} disabled={!hasAnswer || submitting || disabled} className="min-h-11 rounded-xl bg-primary-600 px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          {submitting ? 'Тексерілуде...' : 'Жауапты жіберу'}
        </button>
      )}

      {submitError && <p id={`${questionId}-error`} role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Жауап жіберілмеді. Байланысты тексеріп, қайта көріңіз.</p>}

      {completed && !result && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">✓ Бұл тапсырма орындалған. Прогресс серверде сақталған.</p>}

      {result && (
        <div role="status" aria-live="polite" className={`rounded-xl border p-4 ${result.isCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
          <p className="font-bold">{result.isCorrect ? '✓ Дұрыс жауап' : 'Жауап дұрыс емес'}</p>
          {result.explanation && <p className="mt-2 text-sm leading-6">{result.explanation}</p>}
          {!result.isCorrect && !result.explanation && <p className="mt-2 text-sm leading-6">Сабақ түсіндірмесін қайта оқып, мысалды тексеріңіз. Дайын болғанда қайта жауап беруге болады.</p>}
          {!result.isCorrect && (
            <button type="button" onClick={resetTask} className="mt-3 min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
              Қайта жауап беру
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}
