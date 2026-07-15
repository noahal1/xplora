import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely extract an error message from an unknown caught value.
 */
export function getErrMsg(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as Record<string, unknown>).message === "string"
  ) {
    return (err as Record<string, unknown>).message as string;
  }
  return fallback;
}

/**
 * Check if an unknown caught value is an AbortError (for AbortController).
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Normalize a title for fuzzy comparison.
 * Lowercases, strips, removes special characters, and normalizes unicode accents.
 */
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Extract meaningful words from a title (>=2 chars, no single letters).
 */
function meaningfulWords(s: string): Set<string> {
  const words = s.split(/\s+/).filter(Boolean);
  return new Set(words.filter((w) => w.length >= 2));
}

/**
 * Fuzzy title matching for frontend use.
 *
 * Returns true if two titles refer to the same movie.
 * Matching strategies (in order):
 * 1. Exact match after normalization
 * 2. One title is contained within the other (substring check)
 * 3. Jaccard word overlap >= 0.70 for multi-word titles
 *
 * This mirrors the backend's ``_filter_watched`` matching approach
 * but is simplified to avoid TMDB API calls in the browser.
 */
export function titleMatches(a: string, b: string): boolean {
  if (!a || !b) return false;

  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);

  if (!na || !nb) return false;

  // 1. Exact match after normalization
  if (na === nb) return true;

  // 2. Substring match (one title contained in the other)
  if (na.includes(nb) || nb.includes(na)) return true;

  // 3. Jaccard word overlap for multi-word titles
  const wordsA = meaningfulWords(na);
  const wordsB = meaningfulWords(nb);
  if (wordsA.size > 0 && wordsB.size > 0) {
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    const jaccard = intersection.size / union.size;
    if (jaccard >= 0.7) return true;
  }

  return false;
}

/**
 * Check if a title matches any title in a collection.
 */
export function titleInSet(title: string, titles: string[]): boolean {
  return titles.some((t) => titleMatches(title, t));
}

// ── MoviePilot utility functions ──────────────────────────────────

/** Format bytes into a human-readable string (e.g. "1.5 GB"). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/** Format speed in bytes/s to a human-readable string (e.g. "2.3 MB/s"). */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "—";
  return formatBytes(bytesPerSec) + "/s";
}

/** Format a 0–1 progress value as a percentage string (e.g. "45.2%"). */
export function formatProgress(progress: number): string {
  return (progress * 100).toFixed(1) + "%";
}

/** Map a MoviePilot torrent status code to an i18n label. */
export function getStatusLabel(status: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    downloading: t("moviepilot.downloading"),
    seeding: t("moviepilot.seeding"),
    paused: t("moviepilot.paused"),
    error: t("moviepilot.error"),
  };
  return map[status] || t("moviepilot.unknown");
}

/** Get the Tailwind text color class for a given torrent status. */
export function getStatusColor(status: string): string {
  switch (status) {
    case "downloading": return "text-blue-500";
    case "seeding": return "text-green-500";
    case "paused": return "text-yellow-500";
    case "error": return "text-red-500";
    default: return "text-muted-foreground";
  }
}

/** Get the Tailwind background class for a given torrent status. */
export function getStatusBg(status: string): string {
  switch (status) {
    case "downloading": return "bg-blue-500/10";
    case "seeding": return "bg-green-500/10";
    case "paused": return "bg-yellow-500/10";
    case "error": return "bg-red-500/10";
    default: return "bg-accent/30";
  }
}

