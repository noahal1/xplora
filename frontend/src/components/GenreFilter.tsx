import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateGenreName } from "../utils/genre";

interface GenreFilterProps {
  /** List of unique genre strings to display as pills. */
  genres: string[];
  /** Currently selected genre value. */
  selected: string;
  /** Called when a genre pill is clicked. Receives the genre string. */
  onSelect: (genre: string) => void;
  /**
   * The value that represents "all" (i.e. no filter).
   * @default "all"
   * ManageTab uses "" while RecommendTab/WatchedTab use "all".
   */
  allValue?: string;
  /**
   * How many genres to show before the "more" toggle.
   * @default 6
   */
  visibleCount?: number;
}

export function GenreFilter({
  genres,
  selected,
  onSelect,
  allValue = "all",
  visibleCount = 6,
}: GenreFilterProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const effectiveVisibleCount = isMobile ? Math.min(4, visibleCount) : visibleCount;
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  if (genres.length === 0) return null;

  const hasMore = genres.length > effectiveVisibleCount;

  return (
    <div className="mb-2 sm:mb-3 pb-0.5">
      <div className={`flex items-center gap-1 sm:gap-1.5 pb-0.5 ${showAll ? "flex-wrap" : "flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar"}`}>
        <span className="text-xs text-muted-foreground mr-1 shrink-0 max-sm:hidden">
          {t("manage.genre_filter")}
        </span>
        <button
          className={`pill shrink-0 ${selected === allValue ? "active" : ""}`}
          onClick={() => onSelect(allValue)}
        >
          {t("manage.media_type_all")}
        </button>
        {genres.slice(0, showAll ? genres.length : effectiveVisibleCount).map((g) => (
          <button
            key={g}
            className={`pill shrink-0 ${selected === g ? "active" : ""}`}
            onClick={() => onSelect(g)}
          >
            {translateGenreName(g)}
          </button>
        ))}
        {hasMore && (
          <button
            className="pill text-muted-foreground/60 hover:text-foreground gap-0.5 shrink-0 ml-auto"
            onClick={() => setShowAll((v) => !v)}
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
  );
}
