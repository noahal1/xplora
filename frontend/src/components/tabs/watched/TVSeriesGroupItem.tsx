import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../../types";
import type { TVSeriesGroup } from "../../../utils/groupTVSeries";
import { formatSeasonLabel } from "../../../utils/groupTVSeries";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, Trash2, Info } from "lucide-react";
import { Badge } from "../../ui/badge";
import { translateGenres } from "../../../utils/genre";

interface TVSeriesGroupItemProps {
  group: TVSeriesGroup;
  isSelected: boolean;
  onToggleGroup: (tvSeriesId: string) => void;
  onRemoveSeason: (id: number) => void;
  onRemoveGroup: (seasonIds: number[]) => void;
  onOpenDetail: (movie: MediaDetail) => void;
}

export const TVSeriesGroupItem = memo(function TVSeriesGroupItem({
  group,
  isSelected,
  onToggleGroup,
  onRemoveSeason,
  onRemoveGroup,
  onOpenDetail,
}: TVSeriesGroupItemProps) {
  const { t } = useTranslation();

  const firstSeason = group.seasons[0];
  const avgRating =
    group.seasons.reduce((sum, s) => sum + s.rating, 0) / group.seasons.length;

  return (
    <div
      className={`group relative rounded-xl transition-all duration-200 ${
        isSelected ? "ring-1 ring-primary/30" : ""
      }`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}
    >
      <div className="p-3">
        {/* Header row: checkbox + poster + title + meta */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className="shrink-0 w-4 h-4 accent-primary cursor-pointer mt-1"
            checked={isSelected}
            onChange={() => onToggleGroup(group.tvSeriesId)}
          />

          {/* Poster */}
          <div
            className="w-12 h-[72px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer shadow-sm transition-transform duration-200 hover:scale-[1.04]"
            style={{ border: "1px solid var(--border-subtle)" }}
            onClick={() => onOpenDetail(firstSeason)}
          >
            {group.posterUrl ? (
              <ProgressiveImage
                src={group.posterUrl}
                alt={group.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Film size={18} className="text-muted-foreground/30" />
            )}
          </div>

          {/* Title & meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate" title={group.title}>
                {group.title}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0 leading-none"
              >
                TV
              </Badge>
              <span className="badge font-mono text-[10px] shrink-0">
                {group.seasons.length}季
              </span>
            </div>

            {/* Season chips */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {group.seasons.map((season) => (
                <button
                  key={season.id}
                  onClick={() => onOpenDetail(season)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 cursor-pointer hover:scale-[1.04] active:scale-95"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  title={`${season.title} — ${t("watched.click_to_edit")}`}
                >
                  <span className="text-amber text-[10px]">★</span>
                  <span>{formatSeasonLabel(season.season_number, t("season_specials"))}</span>
                  <span className="text-amber font-semibold">
                    {season.rating.toFixed(1)}
                  </span>
                  {season.episode_count != null && (
                    <span className="opacity-50 ml-0.5">
                      · {season.episode_count}ep
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Sub-meta: year, genre, director info from first season */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {firstSeason.year && (
                <span className="text-[11px] text-muted-foreground font-medium">
                  {firstSeason.year}
                </span>
              )}
              {firstSeason.genre && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/15">
                  {translateGenres(firstSeason.genre)}
                </span>
              )}
              {firstSeason.director && (
                <span className="text-[11px] text-muted-foreground/50 truncate">
                  {firstSeason.director}
                </span>
              )}
            </div>
          </div>

          {/* Average rating + actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Average rating badge */}
            <div
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
              title={t("watched.avg_rating")}
            >
              <span className="text-amber text-sm leading-none">★</span>
              <span className="font-bold text-sm font-mono">
                {avgRating.toFixed(1)}
              </span>
              <span className="text-[10px] text-muted-foreground/60">avg</span>
            </div>

            {/* Detail */}
            <button
              className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/30 hover:text-sky hover:bg-sky/10 transition-all duration-200 opacity-0 group-hover:opacity-100 max-sm:opacity-100"
              onClick={() => onOpenDetail(firstSeason)}
              title={t("manage.detail")}
            >
              <Info size={13} />
            </button>

            {/* Remove all seasons */}
            <button
              className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100 max-sm:opacity-100"
              onClick={() => onRemoveGroup(group.seasons.map((s) => s.id))}
              title={t("watched.remove_all_seasons")}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
