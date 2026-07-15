/** Media server types */
export interface MediaServer {
  id: number;
  name: string;
  server_type: string;
  host: string;
  port: number;
  use_ssl: boolean;
  is_active: boolean;
  has_api_key: boolean;
  has_username: boolean;
  last_connected: string | null;
  last_synced: string | null;
  created_at: string;
}

export interface ServerFormData {
  name: string;
  server_type: string;
  host: string;
  port: number | "";
  api_key: string;
  username: string;
  password: string;
  use_ssl: boolean;
}

export interface VerifyResult {
  online: boolean;
  version: string;
  server_name: string;
  message: string;
}

export interface MediaLibrary {
  id: string;
  name: string;
  media_type: string;
  item_count: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  year: number | null;
  media_type: string;
  overview: string | null;
  runtime: number | null;
  image_tags: Record<string, string> | null;
}

export interface LibraryItemResult {
  items: LibraryItem[];
  total: number;
  limit: number;
  start_index: number;
}

export interface MediaServerSearchResult {
  id: string;
  title: string;
  year: number | null;
  media_type: string;
  series: string | null;
}

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
  tmdb_id?: string | null;
  /** Whether this movie is already in the user's watched library. */
  watched?: boolean;
  /** Whether this movie is already in the user's wishlist. */
  inWishlist?: boolean;
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
  runtime: number | null;
  imdb_id: string | null;
  tmdb_id: string | null;
  country: string | null;
  tagline: string | null;
  scrape_error: string | null;
  pinned?: boolean;
  hidden_from_top?: boolean;
  sort_order?: number | null;
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
  writer?: string;
  country?: string;
  box_office?: string;
  ratings?: Record<string, string>;
}

export interface StatsData {
  total: number;
  total_watched: number;
  total_wishlist: number;
  total_watch_time: number;
  avg_rating: number;
  rating_distribution: Array<{ range: string; count: number }>;
  year_distribution: Array<{ year: number; count: number }>;
  decade_distribution: Array<{ decade: string; count: number }>;
  genre_distribution: Array<{ genre: string; count: number }>;
  country_distribution: Array<{ country: string; count: number }>;
  media_type_distribution: Array<{ type: string; count: number }>;
  monthly_trend: Array<{ month: string; count: number }>;
  top_rated: Array<{
    id: number;
    title: string;
    rating: number;
    year: number | null;
    genre: string | null;
    status: string;
    media_type: string;
    poster_url: string | null;
    overview: string | null;
    runtime: number | null;
    imdb_id: string | null;
    tmdb_id: string | null;
    country: string | null;
    tagline: string | null;
    scrape_error: string | null;
    season_number: number | null;
    episode_count: number | null;
    created_at: string;
  }>;
  recent_additions: Array<{ title: string; status: string; created_at: string }>;
}

/** MoviePilot types */
export interface MoviePilotConfig {
  id?: number;
  name: string;
  host: string;
  port: number;
  use_ssl: boolean;
  is_active?: boolean;
  last_connected?: string | null;
  created_at?: string;
  has_api_token?: boolean;
  configured?: boolean;
}

export interface MoviePilotTorrent {
  hash: string;
  name: string;
  status: string;       // downloading / seeding / paused / error
  progress: number;     // 0-1
  size: number;
  downloaded: number;
  dlspeed: number;      // bytes/s
  ulspeed: number;      // bytes/s
  seeders: number;
  save_path: string;
}

export interface MPSearchResult {
  title: string;
  site: string;
  size: number;
  seeders: number;
  leechers: number;
  download_url: string;
  page_url: string;
  pub_date?: string;
  is_free: boolean;
}

export type SortField = "title" | "rating" | "year" | "genre" | "episode_count" | "created_at";
export type SortDir = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  dir: SortDir;
}
