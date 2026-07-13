import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { translateGenreName } from "../utils/genre";
import { useAutoFitCount } from "../hooks/useAutoFitCount";

interface GenreFilterProps {
  /** List of unique genre strings to display as pills. */
  genres: string[];
  /** Currently selected genre values. Empty set = "all". */
  selected: Set<string>;
  /** Called when selection changes. Receives the new Set<string>. */
  onSelect: (genres: Set<string>) => void;
}

export function GenreFilter({
  genres,
  selected,
  onSelect,
}: GenreFilterProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const gapPx = isMobile ? 4 : 6;
  const moreBtnWidthPx = 72;
  const hasPrefixLabel = !isMobile;
  const prefixCount = hasPrefixLabel ? (selected.size > 0 ? 2 : 1) : (selected.size > 0 ? 1 : 0);

  const [visibleCount, measureRef] = useAutoFitCount(
    containerRef,
    gapPx,
    moreBtnWidthPx,
    prefixCount,
  );

  // When expanded, show all. Otherwise respect auto-fit count.
  const effectiveVisibleCount = showAll ? genres.length : visibleCount;
  const hasMore = showAll || genres.length > visibleCount;
  const visibleGenres = showAll ? genres : genres.slice(0, effectiveVisibleCount);

  const toggleShowAll = useCallback(() => setShowAll((v) => !v), []);

  const toggleGenre = useCallback((g: string) => {
    const next = new Set(selected);
    if (next.has(g)) {
      next.delete(g);
    } else {
      next.add(g);
    }
    onSelect(next);
  }, [selected, onSelect]);

  if (genres.length === 0) return null;

  // Calculate which pills are "new" (appearing after expand) for stagger animation
  const isNew = (idx: number) => showAll && idx >= visibleCount;

  return (
    <div className="mb-2 sm:mb-3 pb-0.5 w-full">
      {/* ── Visible row ──────────────────────────────────────────── */}
      <div ref={containerRef}>
        <div className="flex items-center gap-1 sm:gap-1.5 pb-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0 max-sm:hidden">
            {t("manage.genre_filter")}
          </span>
          {selected.size > 0 && (
            <button
              className="pill shrink-0 active"
              onClick={() => onSelect(new Set())}
            >
              {t("manage.media_type_all")}
              <span className="ml-1 text-[10px]">✕</span>
            </button>
          )}
          {visibleGenres.map((g, i) => (
            <button
              key={g}
              className={`pill shrink-0 ${selected.has(g) ? "active" : ""}${isNew(i) ? " animate-pill-enter" : ""}`}
              style={isNew(i) ? { animationDelay: `${(i - visibleCount) * 30}ms` } : undefined}
              onClick={() => toggleGenre(g)}
            >
              {translateGenreName(g)}
            </button>
          ))}
          {hasMore && (
            <button
              className="pill text-muted-foreground/60 hover:text-foreground gap-0.5 shrink-0"
              onClick={toggleShowAll}
            >
              {showAll ? (
                <><span className="text-[10px]">▲</span> {t("manage.genre_collapse")}</>
              ) : (
                <><span className="text-[10px]">▼</span> +{genres.length - effectiveVisibleCount} {t("manage.genre_more")}</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Hidden measurement div (off-screen) ──────────────────── */}
      <div
        ref={measureRef}
        className="fixed left-[-9999px] top-0 invisible pointer-events-none flex items-center gap-1 sm:gap-1.5"
        aria-hidden="true"
      >
        {/* Must match the visible row EXACTLY — label + all-btn + all pills */}
        {!isMobile && (
          <span className="text-xs text-muted-foreground shrink-0">
            {t("manage.genre_filter")}
          </span>
        )}
        {selected.size > 0 && (
          <span className="pill shrink-0 active">
            {t("manage.media_type_all")}
            <span className="ml-1 text-[10px]">✕</span>
          </span>
        )}
        {genres.map((g) => (
          <span
            key={g}
            className="pill shrink-0 whitespace-nowrap"
          >
            {translateGenreName(g)}
          </span>
        ))}
      </div>
    </div>
  );
}
