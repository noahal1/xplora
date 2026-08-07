/**
 * Genre bilingual helpers.
 *
 * Genres are stored in canonical English by the backend (the filters
 * endpoint normalises Chinese/variant names to English). This module
 * displays them in the CURRENT UI language:
 *
 *   - zh UI  → English name is translated to Chinese (GENRE_EN_TO_ZH)
 *   - en UI  → canonical English is kept; Chinese names stored in legacy
 *              data are mapped back to English (ZH_TO_EN)
 *
 * The reverse mapping is also used for alias matching (e.g. filtering),
 * so selecting "Action" also matches items tagged "动作" and vice-versa.
 */

import i18n from "../i18n/config";

/** Whether the current UI language is English (en / en-US). */
function isEnglishUI(): boolean {
  return !!i18n && typeof i18n.language === "string" && i18n.language.toLowerCase().startsWith("en");
}

/** Genre English → Chinese translation mapping. */
export const GENRE_EN_TO_ZH: Record<string, string> = {
  // Movie genres
  Action: "动作",
  Adventure: "冒险",
  Animation: "动画",
  Comedy: "喜剧",
  Crime: "犯罪",
  Documentary: "纪录片",
  Drama: "剧情",
  Family: "家庭",
  Fantasy: "奇幻",
  History: "历史",
  Horror: "恐怖",
  Music: "音乐",
  Mystery: "悬疑",
  Romance: "爱情",
  "Sci-Fi": "科幻",
  "Science Fiction": "科幻",
  "Science-Fiction": "科幻",
  "TV Movie": "电视电影",
  Thriller: "惊悚",
  War: "战争",
  Western: "西部",

  // TV genres
  "Action & Adventure": "动作冒险",
  Kids: "儿童",
  News: "新闻",
  Reality: "真人秀",
  "Sci-Fi & Fantasy": "科幻奇幻",
  Soap: "肥皂剧",
  Talk: "脱口秀",
  "War & Politics": "战争政治",
};

// Build reverse map: Chinese → English (used to display legacy Chinese
// genre values in the English UI and for alias matching)
const ZH_TO_EN: Record<string, string> = {};
for (const [en, zh] of Object.entries(GENRE_EN_TO_ZH)) {
  if (!(zh in ZH_TO_EN)) {
    ZH_TO_EN[zh] = en;
  }
}

// Legacy genre variants stored by older imports that differ from the
// canonical names (e.g. "纪录" missing the trailing "片"). These are
// treated as aliases of their canonical Chinese name.
export const LEGACY_ALIASES: Record<string, string> = {
  "纪录": "纪录片",
};

/**
 * Get all alias strings (lowercased) for a genre — the genre itself,
 * its Chinese translation (if it's an English genre), its English
 * equivalent (if it's a Chinese genre), plus legacy variants.
 *
 * Example: "Action" → {"action", "动作"},  "动作" → {"动作", "action"},
 * "纪录" → {"纪录", "纪录片", "documentary"}
 *
 * Used for cross-language genre matching (e.g. filtering, dedup), so
 * selecting "Action" also matches items stored as "动作" and vice-versa.
 */
export function getGenreAliases(g: string): Set<string> {
  const lower = g.toLowerCase();
  const aliases = new Set([lower]);
  // Legacy variant: add the canonical Chinese name it maps to
  const legacy = LEGACY_ALIASES[g];
  if (legacy) aliases.add(legacy.toLowerCase());
  // Chinese translation of an English genre
  const zh = GENRE_EN_TO_ZH[g];
  if (zh) aliases.add(zh.toLowerCase());
  // English equivalent of a Chinese genre
  const en = ZH_TO_EN[g];
  if (en) aliases.add(en.toLowerCase());
  return aliases;
}

/**
 * Translate a genre string (e.g. "Action / Drama / Sci-Fi") to the
 * current UI language (zh: "动作 / 剧情 / 科幻", en: unchanged canonical).
 * Unknown genres are passed through as-is.
 */
export function translateGenres(genreStr: string | null | undefined): string {
  if (!genreStr) return "";
  const seen = new Set<string>();
  return genreStr
    .split("/")
    .map((g) => {
      const trimmed = g.trim();
      if (!trimmed) return "";
      return translateGenreName(trimmed);
    })
    .filter((g) => {
      if (!g || seen.has(g.toLowerCase())) return false;
      seen.add(g.toLowerCase());
      return true;
    })
    .join(" / ");
}

/**
 * Translate a single genre name to the current UI language.
 * Unknown genres are passed through as-is.
 */
export function translateGenreName(name: string): string {
  if (!name) return name;
  if (isEnglishUI()) {
    // English UI: keep canonical English; map legacy Chinese back to English
    return ZH_TO_EN[LEGACY_ALIASES[name] || name] || name;
  }
  return GENRE_EN_TO_ZH[name] || LEGACY_ALIASES[name] || name;
}
