import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../../types";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, ChevronRight, Info, X } from "lucide-react";
import { Badge } from "../../ui/badge";
import { translateGenres } from "../../../utils/genre";
import { RatingSlider } from "../../shared/RatingSlider";
import { useRatingEditor } from "../../../hooks/useRatingEditor";

/* ── Memo-ized mobile card — compact card layout for small screens ── */
export const WatchedMobileCard = memo(function WatchedMobileCard({ movie, isSelected, onToggle, onRemove, onSaveRating, onOpenDetail }: {
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
    <div
      className={`p-3 rounded-xl transition-all duration-200 bg-bg-card border border-border ${isSelected ? "ring-1 ring-primary/40" : ""}`}
    >
      {/* Row 1: Checkbox + Poster + Title/Meta */}
      <div className="flex items-start gap-2.5">
        <input type="checkbox"
          className="shrink-0 w-5 h-5 accent-primary cursor-pointer mt-1"
          checked={isSelected} onChange={() => onToggle(movie.id)} />

        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer border border-border-subtle"
          onClick={() => onOpenDetail(movie)}
        >
          {movie.poster_url ? (
            <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
          ) : (
            <Film size={16} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate" onClick={() => onOpenDetail(movie)}>{movie.title}</span>
                {movie.media_type === "tv" && (
                  <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/80">
                {movie.year && <span>{movie.year}</span>}
                {movie.genre && <span className="truncate">{translateGenres(movie.genre)}</span>}
                {movie.runtime && <span className="whitespace-nowrap">{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
              </div>
            </div>
            <ChevronRight size={14} className="shrink-0 mt-0.5 text-fg-dim" />
          </div>
        </div>
      </div>

      {/* Row 2: Rating + Actions */}
      <div className="flex items-center gap-1 mt-2.5 pt-2.5 overflow-x-auto no-scrollbar" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {/* Rating */}
        {editing ? (
          <div className="flex items-center gap-1.5 px-2 py-1" onClick={(e) => e.stopPropagation()}>
            <RatingSlider
              value={localSlider}
              onChange={(v) => setLocalSlider(v)}
              onSave={handleSave}
              size="md"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); if (e.key === "Enter") handleSave(); }}
            />
            <span className="text-amber font-semibold min-w-[28px] text-center text-sm count-badge" key={localSlider}>
              {localSlider.toFixed(1)}
            </span>
          </div>
        ) : (
          <span
            className={`inline-flex items-center gap-1 cursor-pointer transition-all duration-200 px-2 py-1 rounded-lg hover:bg-amber/10 shrink-0 ${justSaved ? 'text-green' : ''}`}
            onClick={handleStartEdit} title={t("watched.click_to_edit")}>
            <span className="text-amber text-base leading-none">★</span>
            {justSaved && <span className="text-green text-[10px]">✓</span>}
            <span className="font-bold text-sm">{movie.rating.toFixed(1)}</span>
          </span>
        )}
        <span className="w-[1px] h-4 bg-border/50 shrink-0" />
        {/* Detail */}
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-sky hover:bg-sky/10"
          onClick={() => onOpenDetail(movie)}
        >
          <Info size={14} />
          <span>{t("manage.detail")}</span>
        </button>
        {/* Remove */}
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
          onClick={() => onRemove(movie.id)}
        >
          <X size={14} />
          <span>{t("watched.remove")}</span>
        </button>
      </div>
    </div>
  );
}, (prev, next) => {
  const id = prev.movie.id;
  if (prev.movie.title !== next.movie.title) return false;
  if (prev.movie.rating !== next.movie.rating) return false;
  if (prev.movie.year !== next.movie.year) return false;
  if (prev.movie.genre !== next.movie.genre) return false;
  if (prev.movie.poster_url !== next.movie.poster_url) return false;
  if (prev.movie.media_type !== next.movie.media_type) return false;
  if (prev.movie.season_number !== next.movie.season_number) return false;
  if (prev.movie.episode_count !== next.movie.episode_count) return false;
  if (prev.movie.runtime !== next.movie.runtime) return false;
  if (prev.isSelected !== next.isSelected) return false;
  return true;
});
