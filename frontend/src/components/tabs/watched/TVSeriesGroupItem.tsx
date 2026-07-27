import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../../types";
import type { TVSeriesGroup } from "../../../utils/groupTVSeries";
import { formatSeasonLabel } from "../../../utils/groupTVSeries";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, Trash2, Info, ChevronRight } from "lucide-react";
import { Badge } from "../../ui/badge";
import { translateGenres } from "../../../utils/genre";

interface TVSeriesGroupItemProps {
  group: TVSeriesGroup;
  onRemoveSeason: (id: number) => void;
  onRemoveGroup: (seasonIds: number[]) => void;
  onOpenDetail: (movie: MediaDetail) => void;
}

export const TVSeriesGroupItem = memo(function TVSeriesGroupItem({
  group,
  onRemoveSeason,
  onRemoveGroup,
  onOpenDetail,
}: TVSeriesGroupItemProps) {
  const { t } = useTranslation();

  const firstSeason = group.seasons[0];
  const avgRating =
    group.seasons.reduce((sum, s) => sum + s.rating, 0) / group.seasons.length;

  return (
    <div className="group rounded-xl transition-all duration-200 bg-bg-card border border-border">
      {/* ── Mobile layout (stacked) ──────────── */}
      <div className="sm:hidden p-3 space-y-2.5">
        {/* Row 1: poster + title + avg rating + chevron */}
        <div className="flex items-start gap-2.5">
          {/* Poster */}
          <div
            className="w-10 h-[60px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer shadow-xs border border-border-subtle"
            onClick={() => onOpenDetail(firstSeason)}
          >
            {group.posterUrl ? (
              <ProgressiveImage
                src={group.posterUrl}
                alt={group.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Film size={16} className="text-muted-foreground/30" />
            )}
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="font-semibold text-sm truncate"
                title={group.title}
                onClick={() => onOpenDetail(firstSeason)}
              >
                {group.title}
              </span>
              <Badge
                variant="outline"
                className="text-[9px] text-sky border-sky/30 bg-sky/5 shrink-0 leading-none px-1 py-0"
              >
                TV
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] text-muted-foreground/70">
                {t("watched.seasons_count", { count: group.seasons.length })}
              </span>
              {firstSeason.year && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-[11px] text-muted-foreground/70">
                    {firstSeason.year}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Avg rating + chevron */}
          <div className="flex items-center gap-0.5 shrink-0">
            <div className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg">
              <span className="text-amber text-sm leading-none">★</span>
              <span className="font-bold text-sm font-mono tabular-nums">
                {avgRating.toFixed(1)}
              </span>
            </div>
            <ChevronRight size={14} className="text-muted-foreground/30" />
          </div>
        </div>

        {/* Row 2: Season chips (scrollable) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-0.5 px-0.5">
          {group.seasons.map((season) => (
            <button
              key={season.id}
              onClick={() => onOpenDetail(season)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-150 cursor-pointer hover:scale-[1.04] active:scale-95 shrink-0"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-subtle)",
              }}
              title={`${season.title} — ${t("watched.click_to_edit")}`}
            >
              <span className="text-amber text-[10px]">★</span>
              <span>{formatSeasonLabel(season.season_number, t("season_specials"))}</span>
              <span className="text-amber font-semibold tabular-nums">
                {season.rating.toFixed(1)}
              </span>
              {season.episode_count != null && (
                <span className="opacity-50 ml-0.5 tabular-nums text-[10px]">
                  · {season.episode_count}ep
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Row 3: Genre + actions */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            {firstSeason.genre && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/15 truncate max-w-[160px]">
                {translateGenres(firstSeason.genre)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/40 hover:text-sky hover:bg-sky/10 transition-all duration-200"
              onClick={() => onOpenDetail(firstSeason)}
              title={t("manage.detail")}
            >
              <Info size={13} />
            </button>
            <button
              className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
              onClick={() => onRemoveGroup(group.seasons.map((s) => s.id))}
              title={t("watched.remove_all_seasons")}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Desktop layout (horizontal) ──────────── */}
      <div className="max-sm:hidden p-3">
        {/* Header row: poster + title + meta */}
        <div className="flex items-start gap-3">
          {/* Poster */}
          <div
            className="w-12 h-[72px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer shadow-sm transition-transform duration-200 hover:scale-[1.04] border border-border-subtle"
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
                {t("watched.seasons_count", { count: group.seasons.length })}
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

            {/* Sub-meta: year, genre from first season */}
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
              className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/30 hover:text-sky hover:bg-sky/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
              onClick={() => onOpenDetail(firstSeason)}
              title={t("manage.detail")}
            >
              <Info size={13} />
            </button>

            {/* Remove all seasons */}
            <button
              className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
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
