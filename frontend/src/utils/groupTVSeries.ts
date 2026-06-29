/**
 * Group TV series media items by tv_series_id for compact display.
 */

import type { MediaDetail } from "../types";

/**
 * Format a season number for display.
 *
 * - ``null`` / ``undefined`` → ``"?"``
 * - ``0`` (Specials) → the provided i18n label (e.g. ``"特别篇"``)
 * - Others → ``"S{number}"`` (e.g. ``"S4"``)
 */
export function formatSeasonLabel(
  seasonNumber: number | null | undefined,
  specialsLabel: string,
): string {
  if (seasonNumber == null) return "?";
  if (seasonNumber === 0) return specialsLabel;
  return `S${seasonNumber}`;
}


export interface TVSeriesGroup {
  tvSeriesId: string;
  title: string;
  seasons: MediaDetail[];
  posterUrl: string | null;
}

/**
 * Strip season markers from a TV series title.
 *
 * Handles:
 * - Chinese: ``黑袍纠察队 第四季`` → ``黑袍纠察队``
 *   Also ``（第四季）``, ``(第4季)``, ``第四季 (2019)``
 * - English: ``The Boys Season 4`` → ``The Boys``
 *   Also ``Season 4 / The Boys``, ``The Boys (Season 4)``, ``S4``
 * - After slash/dash: ``The Boys / Season 4``, ``The Boys — S4``
 *
 * Uses ``[\s\S]*$`` instead of ``\s*$`` so trailing text after the
 * season marker (e.g. year in parentheses) is also removed.
 */
function stripSeasonSuffix(title: string): string {
  let cleaned = title;

  // 1. Chinese "第X季" — with or without brackets, trailing text allowed
  cleaned = cleaned.replace(
    /[\s　]*(?:[（(]\s*)?第[一二三四五六七八九十零〇百千\d]+季\s*[）)]?[\s\S]*$/i,
    "",
  );
  if (cleaned !== title) return cleaned.trim();

  // 2. English "Season X" or "SX" — with or without brackets
  cleaned = cleaned.replace(
    /[\s　]*(?:[（(]\s*)?(?:Season\s+\d+|S\d+)\s*[）)]?[\s\S]*$/i,
    "",
  );
  if (cleaned !== title) return cleaned.trim();

  // 3. After "/" separator:  "Title / Season 4"
  cleaned = cleaned.replace(
    /\s*[/／]\s*(?:[（(]\s*)?(?:Season\s+\d+|S\d+)[\s\S]*$/i,
    "",
  );
  if (cleaned !== title) return cleaned.trim();

  // 4. After "-" or "—" separator: "Title — Season 4"
  cleaned = cleaned.replace(
    /\s*[-—]\s*(?:[（(]\s*)?(?:Season\s+\d+|S\d+)[\s\S]*$/i,
    "",
  );
  if (cleaned !== title) return cleaned.trim();

  // 5. "Part X" or "Vol. X" or "Volume X"
  cleaned = cleaned.replace(
    /[\s　]*(?:[（(]\s*)?(?:Part\s+|Vol\.?\s+|Volume\s+)\d+\s*[）)]?[\s\S]*$/i,
    "",
  );
  if (cleaned !== title) return cleaned.trim();

  // 6. "Series X" (British "Season" synonym)
  cleaned = cleaned.replace(
    /[\s　]*(?:[（(]\s*)?Series\s+\d+\s*[）)]?[\s\S]*$/i,
    "",
  );

  return cleaned.trim();
}

/**
 * Group media items by tv_series_id.
 *
 * Items with the same non-null `tv_series_id` and `media_type === "tv"`
 * are grouped into a `TVSeriesGroup`. Standalone items (movies, or TV
 * series without a tv_series_id) are returned as-is.
 *
 * Season ordering within each group is by `season_number`.
 */
export function groupTVSeries(items: MediaDetail[]): {
  /** Items that are not part of a multi-season TV series group */
  standalone: MediaDetail[];
  /** TV series groups that have 2+ seasons */
  groups: TVSeriesGroup[];
} {
  /** Map tv_series_id → group (only for TV items with series id) */
  const seriesMap = new Map<string, TVSeriesGroup>();
  const singles: MediaDetail[] = [];

  for (const item of items) {
    if (item.tv_series_id && item.media_type === "tv") {
      const existing = seriesMap.get(item.tv_series_id);
      if (existing) {
        existing.seasons.push(item);
        // Use the first season's poster if no series_poster_url
        if (!existing.posterUrl) {
          existing.posterUrl = item.series_poster_url || item.poster_url;
        }
      } else {
        seriesMap.set(item.tv_series_id, {
          tvSeriesId: item.tv_series_id,
          title: stripSeasonSuffix(item.title),
          seasons: [item],
          posterUrl: item.series_poster_url || item.poster_url,
        });
      }
    } else {
      singles.push(item);
    }
  }

  // Split: groups with 2+ seasons become TVSeriesGroup; single-season
  // TV items stay as standalone (nothing to group).
  const groups: TVSeriesGroup[] = [];
  for (const [, group] of seriesMap) {
    if (group.seasons.length >= 2) {
      group.seasons.sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0));
      groups.push(group);
    } else {
      // Only one season — no grouping needed, treat as standalone
      singles.push(group.seasons[0]);
    }
  }

  return { standalone: singles, groups };
}
