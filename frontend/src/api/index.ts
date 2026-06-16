/** Media database API client with auth support */

import type { MediaImport, WishlistItem, MediaDetail, DBSession, DBSessionDetail, Recommendation, MediaSearchResult, ExternalDetail } from "../types";

const API_BASE = "/api";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("xplora-token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("xplora-token");
      window.location.href = "/login";
      throw new Error("登录已过期，请重新登录");
    }
    const err = await res.json().catch(() => ({ detail: "服务器错误" }));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** Add a single watched media item */
export async function addWatchedMedia(
  item: { title: string; year?: number | null; genre?: string | null }
): Promise<MediaDetail> {
  return fetchJSON(`${API_BASE}/media`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(item),
  });
}

/** Replace all watched media items */
export async function replaceMedia(items: MediaImport[]): Promise<void> {
  await fetchJSON(`${API_BASE}/media/replace`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ movies: items }),
  });
}

/** Lightweight endpoint: get just media titles for duplicate detection */
export async function listMediaTitles(): Promise<string[]> {
  const data = await fetchJSON<{ titles: string[] }>(`${API_BASE}/media/titles`, { headers: getAuthHeaders() });
  return data.titles;
}

/** List media items with search & pagination & optional status filter */
export async function listMedia(params: {
  search?: string;
  page?: number;
  page_size?: number;
  status?: string;
  sort_field?: string;
  sort_dir?: string;
  rating_min?: number;
  rating_max?: number;
  has_error?: boolean;
  media_type?: string;
  genre?: string;
  signal?: AbortSignal;
}): Promise<{ media: MediaDetail[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  if (params.status) qs.set("status", params.status);
  if (params.sort_field) qs.set("sort_field", params.sort_field);
  if (params.sort_dir) qs.set("sort_dir", params.sort_dir);
  if (params.rating_min !== undefined) qs.set("rating_min", String(params.rating_min));
  if (params.rating_max !== undefined) qs.set("rating_max", String(params.rating_max));
  if (params.has_error) qs.set("has_error", "true");
  if (params.media_type) qs.set("media_type", params.media_type);
  if (params.genre) qs.set("genre", params.genre);
  return fetchJSON(`${API_BASE}/media?${qs.toString()}`, { headers: getAuthHeaders(), signal: params.signal });
}

/** Update a single media item — supports all metadata fields */
export async function updateMedia(
  id: number,
  data: {
    title: string;
    rating: number;
    year?: number | null;
    genre?: string | null;
    overview?: string | null;
    director?: string | null;
    actors?: string | null;
    runtime?: number | null;
    imdb_id?: string | null;
    tmdb_id?: string | null;
    country?: string | null;
    awards?: string | null;
    tagline?: string | null;
    poster_url?: string | null;
    status?: string;
    media_type?: string;
    tv_series_id?: string | null;
    season_number?: number | null;
    episode_count?: number | null;
    series_poster_url?: string | null;
    created_at?: string;
  }
): Promise<MediaDetail> {
  return fetchJSON(`${API_BASE}/media/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

/** Mark a wishlist item as watched */
export async function markMediaAsWatched(
  id: number,
  rating: number
): Promise<MediaDetail> {
  return fetchJSON(`${API_BASE}/media/${id}/mark-watched`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ rating }),
  });
}

/** Replace all wishlist items */
export async function replaceWishlist(items: WishlistItem[]): Promise<void> {
  await fetchJSON(`${API_BASE}/wishlist/replace`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ movies: items }),
  });
}

/** Append items to the wishlist (no clearing of existing items) */
export async function importWishlist(items: WishlistItem[]): Promise<void> {
  await fetchJSON(`${API_BASE}/wishlist/import`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ movies: items }),
  });
}

/** Add a single item to wishlist */
export async function addToWishlist(
  item: WishlistItem
): Promise<MediaDetail> {
  return fetchJSON(`${API_BASE}/wishlist`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(item),
  });
}

/** Clear all wishlist items */
export async function clearWishlist(): Promise<void> {
  await fetchJSON(`${API_BASE}/wishlist`, { method: "DELETE", headers: getAuthHeaders() });
}

/** Enrich a media item's metadata by scraping TMDB or TVmaze */
export async function enrichMedia(mediaId: number, source: string = "tmdb"): Promise<MediaDetail> {
  return fetchJSON(`${API_BASE}/media/${mediaId}/enrich?source=${source}`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

/** Launch background metadata enrichment for all items without posters */
export async function enrichAllMedia(): Promise<{ enqueued: number }> {
  return fetchJSON(`${API_BASE}/media/enrich-all`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

/** Download and cache posters for items that already have TMDB CDN URLs */
export async function cachePosters(): Promise<{ enqueued: number }> {
  return fetchJSON(`${API_BASE}/media/cache-posters`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

/** Get the status of background metadata enrichment */
export async function getEnrichStatus(): Promise<{
  total: number;
  enriched: number;
  failed: number;
  processed: number;
  pending: number;
}> {
  return fetchJSON(`${API_BASE}/media/enrich-status`, { headers: getAuthHeaders() });
}

/** Delete a single media item */
export async function deleteMedia(id: number): Promise<void> {
  await fetchJSON(`${API_BASE}/media/${id}`, { method: "DELETE", headers: getAuthHeaders() });
}

/** Batch delete media items by IDs */
export async function batchDeleteMedia(ids: number[]): Promise<{ count: number }> {
  return fetchJSON(`${API_BASE}/media/batch-delete`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids }),
  });
}

/** Delete all media items */
export async function deleteAllMedia(): Promise<{ count: number }> {
  return fetchJSON(`${API_BASE}/media`, { method: "DELETE", headers: getAuthHeaders() });
}

/** List sessions */
export async function listSessions(params: {
  page?: number;
  page_size?: number;
}): Promise<{ sessions: DBSession[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return fetchJSON(`${API_BASE}/sessions?${qs.toString()}`, { headers: getAuthHeaders() });
}

/** Get session detail */
export async function getSessionDetail(id: number): Promise<DBSessionDetail> {
  return fetchJSON(`${API_BASE}/sessions/${id}`, { headers: getAuthHeaders() });
}

/** Delete a session */
export async function deleteSession(id: number): Promise<void> {
  await fetchJSON(`${API_BASE}/sessions/${id}`, { method: "DELETE", headers: getAuthHeaders() });
}

/** Export all data as downloadable JSON (admin only) */
export async function exportAllData(): Promise<void> {
  const token = localStorage.getItem("xplora-token");
  const res = await fetch(`${API_BASE}/admin/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    localStorage.removeItem("xplora-token");
    window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "导出失败" }));
    throw new Error(err.detail || "导出失败");
  }
  // Trigger file download
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  a.download = match ? match[1] : `xplora-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Manually rematch a media item to a specific search result */
export async function rematchMedia(
  mediaId: number,
  source: string,
  sourceId: string,
  mediaType: string = "movie"
): Promise<MediaDetail> {
  return fetchJSON(`${API_BASE}/media/${mediaId}/rematch`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ source, source_id: sourceId, media_type: mediaType }),
  });
}

/** Search movies/TV via external sources (TMDB / OMDb) */
export async function searchMedia(
  q: string,
  source: string = "auto"
): Promise<{ results: MediaSearchResult[] }> {
  const qs = new URLSearchParams({ q, source });
  return fetchJSON(`${API_BASE}/media/search?${qs.toString()}`, { headers: getAuthHeaders() });
}

/** Get full media details from external source by ID */
export async function getExternalDetail(
  source: string,
  source_id: string
): Promise<ExternalDetail> {
  const qs = new URLSearchParams({ source, source_id });
  return fetchJSON(`${API_BASE}/media/detail?${qs.toString()}`, { headers: getAuthHeaders() });
}

/** Admin: delete a user */
export async function adminDeleteUser(userId: number): Promise<void> {
  await fetchJSON(`${API_BASE}/auth/users/${userId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

/** Admin: reset a user's password */
export async function adminResetPassword(userId: number, newPassword: string): Promise<void> {
  await fetchJSON(`${API_BASE}/auth/users/${userId}/reset-password`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ new_password: newPassword }),
  });
}

/** List operation logs (admin only) */
export async function listOperationLogs(params: {
  user_id?: number;
  action?: string;
  page?: number;
  page_size?: number;
}): Promise<{
  logs: Array<{ id: number; user_id: number; username: string; action: string; detail: string | null; created_at: string }>;
  total: number;
}> {
  const qs = new URLSearchParams();
  if (params.user_id !== undefined) qs.set("user_id", String(params.user_id));
  if (params.action) qs.set("action", params.action);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return fetchJSON(`${API_BASE}/logs?${qs.toString()}`, { headers: getAuthHeaders() });
}

/** Check for app updates via GitHub Releases */
export async function checkUpdate(force?: boolean): Promise<{
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  release_notes: string | null;
  published_at: string | null;
  error: string | null;
}> {
  const qs = force ? "?force=true" : "";
  return fetchJSON(`${API_BASE}/update/check${qs}`);
}

/** Manually trigger watchtower to check for updates immediately */
export async function triggerUpdate(): Promise<{ status: string; message: string }> {
  return fetchJSON(`${API_BASE}/update/trigger`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

/** Get health status */
export async function getHealth(): Promise<{
  status: string;
  version: string;
  database: string;
  database_status: string;
  api_keys: Record<string, boolean>;
}> {
  return fetchJSON(`${API_BASE}/health`);
}

/** Change current user's password */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await fetchJSON(`${API_BASE}/auth/password`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}
