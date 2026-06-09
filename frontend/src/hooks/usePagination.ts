import { useState, useMemo } from "react";

/**
 * Manages pagination state and computes derived values.
 *
 * @example
 * ```tsx
 * const { page, setPage, totalPages } = usePagination(total, PAGE_SIZE);
 * // ...
 * <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
 * ```
 */
export function usePagination(total: number, pageSize: number) {
  const [page, setPage] = useState(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  return { page, setPage, totalPages };
}
