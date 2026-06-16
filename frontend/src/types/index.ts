/** Shared types for the media recommender */

export interface MediaItem {
  id: number;
  title: string;
  rating: number;
  year: number | null;
  genre: string | null;
  poster_url?: string | null;
  media_type?: string;
  tv_series_id?: string | null;
  season_number?: number | null;
  episode_count?: number | null;
  series_poster_url?: string | null;
}

export interface MediaImport {
  title: string;
  rating: number;
  year?: number | null;
  genre?: string | null;
}

export interface WishlistItem {
  title: string;
  year?: number | null;
  genre?: string | null;
}

export type MediaItemStatus = "watched" | "wish";

export interface Recommendation {
  title: string;
  year?: number | null;
  genre?: string | null;
  reason: string;
  confidence: number;
  media_type?: string;
  poster_url?: string | null;
  /** Whether this movie is already in the user's watched library. */
  watched?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MediaDetail {
  id: number;
  title: string;
  rating: number;
  year: number | null;
  genre: string | null;
  status: MediaItemStatus;
  media_type: string;
  poster_url: string | null;
  overview: string | null;
  director: string | null;
  actors: string | null;
  runtime: number | null;
  imdb_id: string | null;
  tmdb_id: string | null;
  country: string | null;
  awards: string | null;
  tagline: string | null;
  scrape_error: string | null;
  tv_series_id: string | null;
  season_number: number | null;
  episode_count: number | null;
  series_poster_url: string | null;
  created_at: string;
}

export interface DBSession {
  id: number;
  model: string;
  source_count: number;
  recommendation_count: number;
  created_at: string;
}

export interface DBSessionDetail {
  id: number;
  model: string;
  source_count: number;
  created_at: string;
  recommendations: Recommendation[];
}

export interface MediaSearchResult {
  title: string;
  year: number | null;
  genre: string;
  poster_url: string | null;
  source_id: string;
  source: string;
  media_type?: string;
  /** TMDB TV series ID, populated when searching TV shows */
  tv_series_id?: string;
  /** Season number parsed from the search query (e.g. "第四季" → 4) */
  season_number?: number;
  /** Season-specific poster from /tv/{id}/season/{n} */
  season_poster_url?: string;
  /** Original series-level poster (before season poster overwrite) */
  series_poster_url?: string;
  /** Number of episodes in this season */
  episode_count?: number;
}

export interface ExternalDetail {
  title: string;
  year: number | null;
  genre: string;
  poster_url: string | null;
  overview: string;
  rating: number | null;
  vote_count: number | null;
  runtime: number | null;
  tagline: string;
  homepage: string;
  original_language: string;
  source: string;
  source_id: string;
  director?: string;
  actors?: string;
  writer?: string;
  awards?: string;
  country?: string;
  box_office?: string;
  ratings?: Record<string, string>;
}

export type SortField = "title" | "rating" | "year" | "genre" | "created_at";
export type SortDir = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  dir: SortDir;
}
