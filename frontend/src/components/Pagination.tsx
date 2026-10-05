interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  label?: string;
}

export default function Pagination({ page, totalPages, onPageChange, disabled = false, label = 'Беттер' }: PaginationProps) {
  if (totalPages <= 1 && page === 1) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-center gap-4 py-3 text-sm">
      <button type="button" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Алдыңғы</button>
      <span>{page} / {Math.max(1, totalPages)}</span>
      <button type="button" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Келесі</button>
    </nav>
  );
}
