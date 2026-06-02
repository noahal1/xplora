/** Movie database API client with auth support */

import type { MovieImport, WishlistItem, DBMovie, DBSession, DBSessionDetail, Recommendation, MovieSearchResult, MovieDetail } from "../types";

const API_BASE = "/api";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("xplore-token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("xplore-token");
      window.location.href = "/login";
      throw new Error("登录已过期，请重新登录");
    }
    const err = await res.json().catch(() => ({ detail: "服务器错误" }));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** Replace all watched movies */
export async function replaceMovies(movies: MovieImport[]): Promise<void> {
  await fetchJSON(`${API_BASE}/movies/replace`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ movies }),
  });
}

/** Lightweight endpoint: get just movie titles for duplicate detection */
export async function listMovieTitles(): Promise<string[]> {
  const data = await fetchJSON<{ titles: string[] }>(`${API_BASE}/movies/titles`, { headers: getAuthHeaders() });
  return data.titles;
}

/** List movies with search & pagination & optional status filter */
export async function listMovies(params: {
  search?: string;
  page?: number;
  page_size?: number;
  status?: string;
  sort_field?: string;
  sort_dir?: string;
  rating_min?: number;
  rating_max?: number;
  has_error?: boolean;
}): Promise<{ movies: DBMovie[]; total: number }> {
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
  return fetchJSON(`${API_BASE}/movies?${qs.toString()}`, { headers: getAuthHeaders() });
}

/** Update a single movie */
export async function updateMovie(
  id: number,
  data: { title: string; rating: number; year?: number | null; genre?: string | null }
): Promise<DBMovie> {
  return fetchJSON(`${API_BASE}/movies/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

/** Mark a wishlist movie as watched */
export async function markMovieAsWatched(
  id: number,
  rating: number
): Promise<DBMovie> {
  return fetchJSON(`${API_BASE}/movies/${id}/mark-watched`, {
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

/** Add a single movie to wishlist */
export async function addToWishlist(
  item: WishlistItem
): Promise<DBMovie> {
  return fetchJSON(`${API_BASE}/wishlist`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(item),
  });
}

/** Clear all wishlist items */
export async function clearWishlist(): Promise<void> {
  const res = await fetch(`${API_BASE}/wishlist`, { method: "DELETE", headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("xplore-token");
    window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "清除失败" }));
    throw new Error(err.detail);
  }
}

/** Enrich a movie's metadata by scraping TMDB */
export async function enrichMovie(movieId: number): Promise<DBMovie> {
  return fetchJSON(`${API_BASE}/movies/${movieId}/enrich`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

/** Launch background metadata enrichment for all movies without posters */
export async function enrichAllMovies(): Promise<{ enqueued: number }> {
  return fetchJSON(`${API_BASE}/movies/enrich-all`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

/** Download and cache posters for movies that already have TMDB CDN URLs */
export async function cachePosters(): Promise<{ enqueued: number }> {
  return fetchJSON(`${API_BASE}/movies/cache-posters`, {
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
  return fetchJSON(`${API_BASE}/movies/enrich-status`, { headers: getAuthHeaders() });
}

/** Delete a single movie */
export async function deleteMovie(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/movies/${id}`, { method: "DELETE", headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("xplore-token");
    window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "删除失败" }));
    throw new Error(err.detail);
  }
}

/** Batch delete movies by IDs */
export async function batchDeleteMovies(ids: number[]): Promise<{ count: number }> {
  return fetchJSON(`${API_BASE}/movies/batch-delete`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids }),
  });
}

/** Delete all movies */
export async function deleteAllMovies(): Promise<{ count: number }> {
  return fetchJSON(`${API_BASE}/movies`, { method: "DELETE", headers: getAuthHeaders() });
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
  const res = await fetch(`${API_BASE}/sessions/${id}`, { method: "DELETE", headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("xplore-token");
    window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "删除失败" }));
    throw new Error(err.detail);
  }
}

/** Export all data as downloadable JSON (admin only) */
export async function exportAllData(): Promise<void> {
  const token = localStorage.getItem("xplore-token");
  const res = await fetch(`${API_BASE}/admin/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    localStorage.removeItem("xplore-token");
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
  a.download = match ? match[1] : `xplore-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Manually rematch a movie to a specific search result */
export async function rematchMovie(
  movieId: number,
  source: string,
  sourceId: string
): Promise<DBMovie> {
  return fetchJSON(`${API_BASE}/movies/${movieId}/rematch`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ source, source_id: sourceId }),
  });
}

/** Search movies via external sources (TMDB / OMDb) */
export async function searchMovies(
  q: string,
  source: string = "auto"
): Promise<{ results: MovieSearchResult[] }> {
  const qs = new URLSearchParams({ q, source });
  return fetchJSON(`${API_BASE}/movies/search?${qs.toString()}`, { headers: getAuthHeaders() });
}

/** Get full movie details from external source by ID */
export async function getMovieDetail(
  source: string,
  source_id: string
): Promise<MovieDetail> {
  const qs = new URLSearchParams({ source, source_id });
  return fetchJSON(`${API_BASE}/movies/detail?${qs.toString()}`, { headers: getAuthHeaders() });
}

/** Admin: delete a user */
export async function adminDeleteUser(userId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (res.status === 401) {
    localStorage.removeItem("xplore-token");
    window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "删除失败" }));
    throw new Error(err.detail);
  }
}

/** Admin: reset a user's password */
export async function adminResetPassword(userId: number, newPassword: string): Promise<void> {
  await fetchJSON(`${API_BASE}/auth/users/${userId}/reset-password`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ new_password: newPassword }),
  });
}

/** Get health status */
export async function getHealth(): Promise<{ status: string; models: Record<string, boolean> }> {
  return fetchJSON(`${API_BASE}/health`);
}

/** Change current user's password */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/password`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
  if (res.status === 401) {
    localStorage.removeItem("xplore-token");
    window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "修改失败" }));
    throw new Error(err.detail || "修改失败");
  }
}
