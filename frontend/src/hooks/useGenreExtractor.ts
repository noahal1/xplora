import { useMemo } from "react";

/**
 * Extracts sorted unique genre strings from an array of items that have a
 * `genre` property. Handles genres separated by `" / "`.
 *
 * @example
 * ```tsx
 * const genres = useGenreExtractor(movies);
 * // genres === ["Action", "Comedy", "Drama", "Sci-Fi"]
 * ```
 */
export function useGenreExtractor(
  items: Array<{ genre: string | null | undefined }>,
): string[] {
  return useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.genre) {
        for (const g of item.genre.split("/")) {
          const trimmed = g.trim();
          if (trimmed) set.add(trimmed);
        }
      }
    }
    return Array.from(set).sort();
  }, [items]);
}
