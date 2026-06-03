/** Shared types for the movie recommender */

export interface Movie {
  id: number;
  title: string;
  rating: number;
  year: number | null;
  genre: string | null;
  poster_url?: string | null;
  media_type?: string;
}

export interface MovieImport {
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

export type MovieStatus = "watched" | "wish";

export interface Recommendation {
  title: string;
  year?: number | null;
  genre?: string | null;
  reason: string;
  confidence: number;
  media_type?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DBMovie {
  id: number;
  title: string;
  rating: number;
  year: number | null;
  genre: string | null;
  status: MovieStatus;
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

export interface MovieSearchResult {
  title: string;
  year: number | null;
  genre: string;
  poster_url: string | null;
  source_id: string;
  source: string;
  media_type?: string;
}

export interface MovieDetail {
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
