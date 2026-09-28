export default function LoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
      <p className="font-semibold">Деректерді жүктеу мүмкін болмады.</p>
      <p className="mt-1 text-sm">Байланысты тексеріп, қайта көріңіз.</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
        Қайта жүктеу
      </button>
    </div>
  );
}
