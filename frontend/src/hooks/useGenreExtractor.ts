import { useMemo } from "react";
import { getGenreAliases, GENRE_EN_TO_ZH, LEGACY_ALIASES } from "../utils/genre";

/**
 * Extracts sorted unique genre strings from an array of items that have a
 * `genre` property. Handles genres separated by `" / "`.
 *
 * Deduplicates Chinese/English genre aliases — e.g. "Action" and "动作"
 * are treated as the same genre, preferring the Chinese name for display.
 *
 * @example
 * ```tsx
 * const genres = useGenreExtractor(movies);
 * // genres === ["动作", "喜剧", "剧情", "科幻"]
 * ```
 */
export function useGenreExtractor(
  items: Array<{ genre: string | null | undefined }>,
): string[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of items) {
      if (item.genre) {
        for (const g of item.genre.split("/")) {
          // Normalize: trim + collapse multiple spaces + handle Unicode whitespace
          const normalized = g.trim().replace(/\s+/g, " ");
          if (!normalized) continue;

          const aliases = getGenreAliases(normalized);

          // Skip if any alias is already seen (handles Chinese/English dedup)
          let isDuplicate = false;
          for (const alias of aliases) {
            if (seen.has(alias)) {
              isDuplicate = true;
              break;
            }
          }
          if (isDuplicate) continue;

          // Mark all aliases as seen
          for (const alias of aliases) {
            seen.add(alias);
          }

          // Prefer Chinese display name when available (e.g. "动作" not "Action"),
          // then legacy variant canonicalization (e.g. "纪录" → "纪录片")
          const display = GENRE_EN_TO_ZH[normalized] || LEGACY_ALIASES[normalized] || normalized;
          result.push(display);
        }
      }
    }

    return result.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }, [items]);
}
