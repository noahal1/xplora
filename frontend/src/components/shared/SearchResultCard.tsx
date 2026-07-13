import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaSearchResult } from "../../types";
import { Badge } from "../ui/badge";
import { ProgressiveImage } from "../ProgressiveImage";
import { formatSeasonLabel } from "../../utils/groupTVSeries";
import { translateGenres } from "../../utils/genre";
import { Film, Loader2, Plus } from "lucide-react";

interface SearchResultCardProps {
  result: MediaSearchResult;
  /** Show checkbox for batch selection */
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Whether the add action is in progress */
  adding?: boolean;
  /** Whether this item already exists in the user's list */
  alreadyAdded?: boolean;
  /** Called when the user clicks the add button */
  onAdd: () => void;
  /** Called when the user clicks on the card (for detail view) */
  onDetail?: () => void;
  /** Whether to use ProgressiveImage for the poster (smoother loading) */
  progressivePoster?: boolean;
  /** Custom label for the add button */
  addLabel?: string;
}

/**
 * Shared search result card used by SearchImportModal, SearchModal,
 * and WishlistSearchModal. Provides a consistent layout:
 *
 *   [checkbox] [poster] [title + year + genre + badges] [add button]
 */
export const SearchResultCard = memo(function SearchResultCard({
  result,
  selected,
  onToggleSelect,
  adding,
  alreadyAdded,
  onAdd,
  onDetail,
  progressivePoster,
  addLabel,
}: SearchResultCardProps) {
  const { t } = useTranslation();

  const poster = (
    <div
      className="w-10 h-14 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center cursor-pointer relative group border border-border-subtle"
      onClick={onDetail ?? onAdd}
    >
      {result.poster_url ? (
        progressivePoster ? (
          <ProgressiveImage
            src={result.poster_url}
            alt={result.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <img
              src={result.poster_url}
              alt={result.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            {/* Series poster hover zoom (SearchImportModal style) */}
            {result.series_poster_url && result.series_poster_url !== result.poster_url && (
              <div
                className="absolute bottom-0.5 right-0.5 w-[18px] h-[24px] rounded-[3px] overflow-hidden shadow-md ring-1 ring-border/50 bg-muted opacity-80 group-hover:opacity-100 group-hover:scale-[2.2] group-hover:z-20 group-hover:shadow-xl transition-all duration-200 origin-bottom-right"
                title="Series poster (zoom on hover)"
              >
                <img
                  src={result.series_poster_url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </>
        )
      ) : (
        <Film size={14} className="text-muted-foreground/40" />
      )}
    </div>
  );

  return (
    <div
      className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl border transition-all card-lift ${
        selected !== undefined
          ? selected
            ? "border-primary/40 bg-primary/[0.04]"
            : "border-border hover:border-primary/30 hover:bg-accent/20"
          : "border-border hover:border-primary/30 hover:bg-accent/20"
      }${onDetail ? " cursor-pointer" : ""}`}
      onClick={onDetail}
    >
      {/* Checkbox (batch selection) */}
      {onToggleSelect && (
        <input
          type="checkbox"
          className="w-4 h-4 sm:w-3.5 sm:h-3.5 accent-primary cursor-pointer shrink-0"
          checked={!!selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Poster */}
      {poster}

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={onDetail ?? (() => {})}>
        <p className="text-sm font-medium truncate">{result.title}</p>
        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
          {result.year && (
            <span className="text-[10px] sm:text-xs text-muted-foreground tabular-nums">
              {result.year}
            </span>
          )}
          {result.genre && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground truncate max-w-[100px] sm:max-w-[120px]">
              {translateGenres(result.genre)}
            </span>
          )}
          {/* Season badge (TV with season_number) */}
          {result.season_number != null && (
            <Badge
              variant="outline"
              className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5"
            >
              {formatSeasonLabel(result.season_number, t("season_specials"))}
              {result.episode_count != null && (
                <span className="ml-0.5 opacity-70">· {result.episode_count}ep</span>
              )}
            </Badge>
          )}
          {/* TV badge */}
          {result.media_type === "tv" && (
            <Badge
              variant="outline"
              className="text-[10px] text-sky border-sky/30 bg-sky/5"
            >
              TV
            </Badge>
          )}
          {/* Source badge */}
          <Badge variant="outline" className="text-[10px]">
            {result.source.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Add button */}
      <button
        className={`btn shrink-0 ${alreadyAdded ? "btn-ghost opacity-60" : ""} btn-xs max-sm:px-2 max-sm:py-1.5 gap-1`}
        disabled={adding || alreadyAdded}
        onClick={(e) => {
          e.stopPropagation();
          if (!alreadyAdded) onAdd();
        }}
      >
        {adding ? (
          <Loader2 size={12} className="animate-spin" />
        ) : alreadyAdded ? (
          <span className="text-[11px] whitespace-nowrap">{t("wishlist.already_added", "已添加")}</span>
        ) : (
          <>
            <Plus size={14} className="sm:size-3.5" />
            <span className="hidden sm:inline">{addLabel ?? t("wishlist.add", "添加")}</span>
          </>
        )}
      </button>
    </div>
  );
});
