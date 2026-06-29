import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../../types";
import TiltedCard from "../../TiltedCard";
import { Film, X } from "lucide-react";
import { Badge } from "../../ui/badge";
import CountUp from "../../CountUp";
import { formatSeasonLabel } from "../../../utils/groupTVSeries";
import { RatingSlider } from "../../shared/RatingSlider";
import { useRatingEditor } from "../../../hooks/useRatingEditor";

/* ── Memo-ized grid card — cinematic poster with overlay ─────── */
export const MovieGridCard = memo(function MovieGridCard({ movie, isSelected, onToggle, onRemove, onSaveRating, onOpenDetail }: {
  movie: MediaDetail;
  isSelected: boolean;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onSaveRating: (id: number, rating: number) => Promise<void>;
  onOpenDetail: (movie: MediaDetail) => void;
}) {
  const { t } = useTranslation();
  const {
    editing, localSlider, justSaved, setLocalSlider,
    handleStartEdit, handleSave, handleCancel,
  } = useRatingEditor({
    movieId: movie.id,
    currentRating: movie.rating,
    onSaveRating,
  });

  return (
    <div className={`group relative overflow-hidden rounded-xl transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
      {/* Checkbox — always visible on mobile, hover on desktop */}
      <input type="checkbox"
        className="absolute top-2 left-2 z-20 w-4 h-4 accent-primary cursor-pointer opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity duration-200"
        checked={isSelected} onChange={() => onToggle(movie.id)} />
      {/* Delete button — always visible on mobile, hover on desktop */}
      <button
        className="absolute top-2 right-2 z-20 flex items-center justify-center w-6 h-6 sm:w-6 sm:h-6 rounded-full bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 max-sm:opacity-100 hover:bg-red-500/80 hover:text-white transition-all duration-200 backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); onRemove(movie.id); }} title={t("watched.remove")}>
        <X size={14} />
      </button>
      {/* Poster — 3D tilt effect on hover */}
      <div className="aspect-[2/3] relative cursor-pointer overflow-hidden rounded-xl" onClick={() => onOpenDetail(movie)}>
        {movie.poster_url ? (
          <TiltedCard
            imageSrc={movie.poster_url}
            altText={movie.title}
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
                {/* Gradient overlay for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />
                {/* Year badge top-left (offset right to avoid checkbox overlap) */}
                {movie.year && (
                  <div className="absolute top-2 left-8 z-10">
                    <span className="text-[10px] font-semibold text-white bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-md">{movie.year}</span>
                  </div>
                )}
                {/* TV badge */}
                {movie.media_type === "tv" && (
                  <div className="absolute top-2 left-8 z-10" style={{ marginTop: movie.year ? '18px' : '0' }}>
                    <Badge className="text-[9px] text-sky-200 border-sky-400/40 bg-sky-500/20 backdrop-blur-sm">TV</Badge>
                  </div>
                )}
                {/* Title on poster */}
                <div className="absolute bottom-0 inset-x-0 p-2.5 z-10">
                  <div className="font-semibold text-sm text-white leading-tight line-clamp-2 drop-shadow-sm">{movie.title}</div>
                  {/* Season info */}
                  {movie.season_number != null && (
                    <div className="flex items-center gap-1 mt-1">
                      <Badge className="text-[9px] text-violet-200 border-violet-400/40 bg-violet-500/20 backdrop-blur-sm leading-none px-1.5 py-0.5">
                        {formatSeasonLabel(movie.season_number, t("season_specials"))}{movie.episode_count != null && <span className="ml-0.5 opacity-80">· {movie.episode_count}ep</span>}
                      </Badge>
                    </div>
                  )}
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
      {/* Rating editing */}
      <div className="px-2.5 py-2 border-t border-border/50">
        {editing ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <RatingSlider
              value={localSlider}
              onChange={(v) => setLocalSlider(v)}
              onSave={handleSave}
              size="sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); if (e.key === "Enter") handleSave(); }}
            />
            <span className="text-amber font-semibold text-xs min-w-[24px] text-center count-badge" key={localSlider}>
              {localSlider.toFixed(1)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <span
              className={`inline-flex items-center gap-1 text-xs cursor-pointer transition-all duration-200 px-2 py-0.5 rounded-full hover:bg-amber/10 ${justSaved ? 'text-green' : 'text-muted-foreground hover:text-amber'}`}
              onClick={handleStartEdit} title={t("watched.click_to_edit")}>
              <span className="text-amber">★</span>
              {justSaved && <span className="text-green text-[10px]">✓</span>}
              <span className="font-semibold"><CountUp end={movie.rating} decimals={1} /></span>
              <span className="text-[9px] opacity-50 ml-0.5">{t("watched.edit")}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
