export default function LoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-red-900 sm:p-6">
      <p className="font-semibold">Деректерді жүктеу мүмкін болмады.</p>
      <p className="mt-2 text-sm leading-6">Байланысты тексеріп, қайта көріңіз.</p>
      <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
        Қайта жүктеу
      </button>
    </div>
  );
}
