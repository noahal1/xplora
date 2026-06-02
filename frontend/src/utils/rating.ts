/** Rating scale normalization and star rendering */

import type { Movie } from "../types";

/**
 * Normalize rating scale: if max rating <= 5, assume 1-5 star scale
 * and multiply by 2 to map to 0-10 range.
 */
export function normalizeRatingScale(movies: Movie[]): Movie[] {
  if (movies.length === 0) return movies;
  const maxRating = Math.max(...movies.map((m) => m.rating));
  if (maxRating <= 5) {
    return movies.map((m) => ({
      ...m,
      rating: Math.round(m.rating * 2 * 10) / 10,
    }));
  }
  return movies;
}

/** Render star HTML for a 0-10 rating */
export function renderStars(rating: number): string {
  const starCount = Math.round(rating / 2);
  const filled = Math.max(0, Math.min(5, starCount));
  const empty = 5 - filled;

  return (
    '<span class="stars">' +
    '<span class="star-filled">&#9733;</span>'.repeat(filled) +
    '<span class="star-empty">&#9733;</span>'.repeat(empty) +
    "</span>"
  );
}
