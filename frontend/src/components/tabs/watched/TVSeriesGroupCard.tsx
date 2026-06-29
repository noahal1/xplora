import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../../types";
import type { TVSeriesGroup, formatSeasonLabel } from "../../../utils/groupTVSeries";
import TiltedCard from "../../TiltedCard";
import { Film } from "lucide-react";
import { Badge } from "../../ui/badge";

interface TVSeriesGroupCardProps {
  group: TVSeriesGroup;
  isSelected: boolean;
  onToggleGroup: (tvSeriesId: string) => void;
  onOpenDetail: (movie: MediaDetail) => void;
}

export const TVSeriesGroupCard = memo(function TVSeriesGroupCard({
  group,
  isSelected,
  onToggleGroup,
  onOpenDetail,
}: TVSeriesGroupCardProps) {
  const { t } = useTranslation();

  const firstSeason = group.seasons[0];
  const avgRating =
    group.seasons.reduce((sum, s) => sum + s.rating, 0) / group.seasons.length;
  const seasonRange =
    group.seasons.length >= 2
      ? `${formatSeasonLabel(group.seasons[0].season_number, t("season_specials"))}–${formatSeasonLabel(group.seasons[group.seasons.length - 1].season_number, t("season_specials"))}`
      : formatSeasonLabel(group.seasons[0].season_number, t("season_specials"));

  return (
    <div
      className={`group relative overflow-hidden rounded-xl transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 ${
        isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        className="absolute top-2 left-2 z-20 w-4 h-4 accent-primary cursor-pointer opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity duration-200"
        checked={isSelected}
        onChange={() => onToggleGroup(group.tvSeriesId)}
      />

      {/* Poster with tilt */}
      <div
        className="aspect-[2/3] relative cursor-pointer overflow-hidden rounded-xl"
        onClick={() => onOpenDetail(firstSeason)}
      >
        {group.posterUrl ? (
          <TiltedCard
            imageSrc={group.posterUrl}
            altText={group.title}
            containerHeight="100%"
            containerWidth="100%"
            imageHeight="100%"
            imageWidth="100%"
            scaleOnHover={1.03}
            rotateAmplitude={8}
            showTooltip={false}
            showMobileWarning={false}
            displayOverlayContent={true}
            className="rounded-xl"
            overlayContent={
              <div className="relative w-full h-full">
                {/* Gradient overlay */}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

                {/* TV badge + season range */}
                <div className="absolute top-2 left-8 z-10">
                  <Badge className="text-[9px] text-sky-200 border-sky-400/40 bg-sky-500/20 backdrop-blur-sm">
                    TV · {seasonRange}
                  </Badge>
                </div>

                {/* Title + season chips */}
                <div className="absolute bottom-0 inset-x-0 p-2.5 z-10">
                  <div className="font-semibold text-sm text-white leading-tight line-clamp-2 drop-shadow-sm">
                    {group.title}
                  </div>
                  {/* Season chips */}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {group.seasons.map((season) => (
                      <span
                        key={season.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetail(season);
                        }}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer hover:bg-white/20 transition-colors"
                        style={{ background: "rgba(255,255,255,0.12)" }}
                      >
                        <span className="text-amber">★</span>
                        <span className="text-white/90">
                          {formatSeasonLabel(season.season_number, t("season_specials"))}
                        </span>
                        <span className="text-amber font-semibold">
                          {season.rating.toFixed(1)}
                        </span>
                      </span>
                    ))}
                  </div>
                  {/* Average rating */}
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-amber text-[10px]">★</span>
                    <span className="text-white/80 text-[10px] font-semibold">
                      {avgRating.toFixed(1)} avg
                    </span>
                    <span className="text-white/50 text-[9px] ml-auto">
                      {group.seasons.length}季
                    </span>
                  </div>
                </div>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30 bg-muted/40">
            <Film size={28} className="opacity-50" />
          </div>
        )}
      </div>
      {/* Rating bar */}
      <div className="px-2.5 py-2 border-t border-border/50">
        <div className="flex items-center justify-center text-xs text-muted-foreground">
          <span className="text-amber">★</span>
          <span className="font-semibold ml-1">{avgRating.toFixed(1)}</span>
          <span className="ml-1 opacity-60">avg</span>
          <span className="mx-1.5 opacity-30">·</span>
          <span className="opacity-60">{group.seasons.length}季</span>
        </div>
      </div>
    </div>
  );
});
