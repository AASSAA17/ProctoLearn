export function ReleaseIndicator() {
  const release = process.env.NEXT_PUBLIC_RELEASE_LABEL?.trim();
  if (!release) return null;
  return <div className="fixed bottom-2 right-2 z-40 rounded-md border border-slate-300/70 bg-white/95 px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm" aria-label={`Қолданыстағы нұсқа: ${release}`}>
    Нұсқа: {release}
  </div>;
}
