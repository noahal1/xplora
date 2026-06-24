import type { ReactNode } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional info text rendered on the right (e.g. "1–50 / 200 movies"). */
  info?: ReactNode;
}

/** Unified pagination control used across all tabs. Pages are 0-indexed. */
export function Pagination({ currentPage, totalPages, onPageChange, info }: PaginationProps) {
  if (totalPages <= 1) return null;

  const maxVisible = 7;
  let pageStart = Math.max(0, currentPage - Math.floor(maxVisible / 2));
  const pageEnd = Math.min(totalPages, pageStart + maxVisible);
  if (pageEnd - pageStart < maxVisible) {
    pageStart = Math.max(0, pageEnd - maxVisible);
  }

  return (
    <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        <button
          className="page-btn"
          disabled={currentPage === 0}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pageStart > 0 && (
          <>
            <button className="page-btn" onClick={() => onPageChange(0)}>1</button>
            {pageStart > 1 && <span className="px-1 text-muted-foreground text-sm leading-none">···</span>}
          </>
        )}

        {Array.from({ length: pageEnd - pageStart }).map((_, i) => {
          const p = pageStart + i;
          return (
            <button
              key={p}
              className={`page-btn ${p === currentPage ? "active" : ""}`}
              onClick={() => onPageChange(p)}
            >
              {p + 1}
            </button>
          );
        })}

        {pageEnd < totalPages && (
          <>
            {pageEnd < totalPages - 1 && <span className="px-1 text-muted-foreground text-sm leading-none">···</span>}
            <button className="page-btn" onClick={() => onPageChange(totalPages - 1)}>{totalPages}</button>
          </>
        )}

        <button
          className="page-btn"
          disabled={currentPage >= totalPages - 1}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
      {info && <span className="text-xs text-muted-foreground">{info}</span>}
    </div>
  );
}
