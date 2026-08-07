/**
 * Date formatting helpers.
 *
 * The backend stores every timestamp in UTC. SQLite strips the timezone
 * marker on write, so older API responses can carry timezone-less values
 * like "2026-08-06T02:30:00" — per the ISO spec JS would parse those as
 * LOCAL time, shifting every displayed time by the user's UTC offset
 * (e.g. 8 hours off for UTC+8). We therefore treat any timezone-less
 * timestamp as UTC and let `Date` convert it to the browser's local
 * timezone, so all displayed times are correct for the viewer.
 */

/** Parse a backend timestamp as a Date, assuming UTC when no offset is given. */
export function parseBackendDate(iso: string | null | undefined): Date {
  const s = (iso ?? "").trim();
  if (!s) return new Date(NaN);
  // Strings with an explicit offset or "Z" are unambiguous.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return new Date(s);
  // Date-only values ("2026-08-06") are already parsed as UTC by the spec.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
  // Naive date-times are UTC — normalize the separator and append "Z".
  return new Date(`${s.replace(" ", "T")}Z`);
}

/** Format an ISO timestamp as YYYY-MM-DD (local timezone). */
export function formatDate(iso: string | null | undefined): string {
  const d = parseBackendDate(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format an ISO timestamp as YYYY-MM-DD HH:mm (local timezone). */
export function formatDateTime(iso: string | null | undefined): string {
  const d = parseBackendDate(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Format an ISO timestamp with the browser's locale, e.g. "8/6/2026, 10:30:00 AM". */
export function formatLocaleDateTime(iso: string | null | undefined): string {
  const d = parseBackendDate(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

/**
 * Convert a local calendar date ("YYYY-MM-DD" from a date input) to an ISO
 * timestamp at LOCAL midnight.
 *
 * Used when saving an edited date: the picked day is a local calendar date,
 * so persisting it as local midnight (the browser converts it to the exact
 * UTC instant) makes it round-trip back to the same day in any timezone.
 */
export function localDateToISO(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}
