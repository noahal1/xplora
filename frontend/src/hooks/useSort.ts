import { useState, useCallback } from "react";
import type { SortField, SortDir } from "../types";

/**
 * Manages sort state (field + direction) with a unified toggle handler.
 *
 * When toggling the same field, direction flips. When switching to a new
 * field, direction resets to `"desc"` (or `"asc"` for `"title"`).
 *
 * @example
 * ```tsx
 * const { field, dir, toggle } = useSort("created_at", "desc");
 * // ...
 * <button onClick={() => toggle("title")}>
 *   Title {field === "title" ? (dir === "asc" ? "↑" : "↓") : ""}
 * </button>
 * ```
 */
export function useSort(
  initialField: SortField = "created_at",
  initialDir: SortDir = "desc",
) {
  const [field, setField] = useState<SortField>(initialField);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const toggle = useCallback((newField: SortField) => {
    setField((prev) => {
      if (prev === newField) {
        // Flip direction when clicking the same field
        setDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      // Default new fields to "desc", except "title" which defaults to "asc"
      setDir(newField === "title" ? "asc" : "desc");
      return newField;
    });
  }, []);

  return { field, dir, toggle };
}
