import { useMemo } from "react";
import { GENRE_EN_TO_ZH } from "../utils/genre";

// Build reverse map: Chinese → English
const ZH_TO_EN: Record<string, string> = {};
for (const [en, zh] of Object.entries(GENRE_EN_TO_ZH)) {
  ZH_TO_EN[zh] = en;
}

/**
 * Get all alias strings (lowercased) for a genre — the genre itself,
 * its Chinese translation (if it's an English genre), and its English
 * equivalent (if it's a Chinese genre).
 *
 * Example: "Action" → {"action", "动作"},  "动作" → {"动作", "action"}
 */
function getGenreAliases(g: string): Set<string> {
  const lower = g.toLowerCase();
  const aliases = new Set([lower]);
  // Chinese translation of an English genre
  const zh = GENRE_EN_TO_ZH[g];
  if (zh) aliases.add(zh.toLowerCase());
  // English equivalent of a Chinese genre
  const en = ZH_TO_EN[g];
  if (en) aliases.add(en.toLowerCase());
  return aliases;
}

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

          // Prefer Chinese display name when available (e.g. "动作" not "Action")
          const display = GENRE_EN_TO_ZH[normalized] || normalized;
          result.push(display);
        }
      }
    }

    return result.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }, [items]);
}
