/**
 * Genre English → Chinese translation mapping.
 * Covers all standard TMDB movie and TV genres.
 */

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

/**
 * Translate an English genre string (e.g. "Action / Drama / Sci-Fi")
 * to Chinese (e.g. "动作 / 剧情 / 科幻").
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
      return GENRE_EN_TO_ZH[trimmed] || trimmed;
    })
    .filter((g) => {
      if (!g || seen.has(g.toLowerCase())) return false;
      seen.add(g.toLowerCase());
      return true;
    })
    .join(" / ");
}

/**
 * Translate a single genre name (e.g. "Action" → "动作").
 * Unknown genres are passed through as-is.
 */
export function translateGenreName(name: string): string {
  return GENRE_EN_TO_ZH[name] || name;
}
