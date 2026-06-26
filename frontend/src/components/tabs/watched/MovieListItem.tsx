import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../../types";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, X } from "lucide-react";
import { Badge } from "../../ui/badge";
import { translateGenres } from "../../../utils/genre";
import CountUp from "../../CountUp";
import { RatingSlider } from "../../shared/RatingSlider";
import { useRatingEditor } from "../../../hooks/useRatingEditor";

/* ── Memo-ized list item — rich layout with poster & metadata ── */
export const MovieListItem = memo(function MovieListItem({ movie, isSelected, onToggle, onRemove, onSaveRating, onOpenDetail }: {
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
      className={`group flex items-center gap-3.5 p-3 rounded-xl transition-all duration-200 hover:-translate-y-0.5 ${isSelected ? "ring-1 ring-primary/30" : ""}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
      <input type="checkbox" className="shrink-0 w-4 h-4 accent-primary cursor-pointer"
        checked={isSelected} onChange={() => onToggle(movie.id)} />
      {/* Poster */}
      <div
        className="w-12 h-[72px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer shadow-sm transition-transform duration-200 group-hover:scale-[1.04]"
        style={{ border: "1px solid var(--border-subtle)" }}
        onClick={() => onOpenDetail(movie)}>
        {movie.poster_url ? (
          <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
        ) : (
          <Film size={18} className="text-muted-foreground/30" />
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate" title={movie.title}>{movie.title}</span>
          {movie.media_type === "tv" && (
            <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0 leading-none">TV</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {movie.year && <span className="text-xs text-muted-foreground font-medium">{movie.year}</span>}
          {movie.runtime && <span className="text-xs text-muted-foreground/60">{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
          {movie.genre && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/15">
              {translateGenres(movie.genre)}
            </span>
          )}
          {movie.season_number != null && (
            <Badge variant="outline" className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5">
              S{movie.season_number}{movie.episode_count != null && <span className="ml-0.5 opacity-70">· {movie.episode_count}ep</span>}
            </Badge>
          )}
        </div>
        {movie.director && (
          <p className="text-[11px] text-muted-foreground/50 mt-0.5 truncate">{movie.director}</p>
        )}
      </div>
      {/* Rating + Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 cursor-pointer transition-all duration-200 px-2 py-1 rounded-lg hover:bg-amber/10 ${justSaved ? 'text-green' : ''}`}
            onClick={handleStartEdit} title={t("watched.click_to_edit")}>
            <span className="text-amber text-base leading-none">★</span>
            {justSaved && <span className="text-green text-[10px]">✓</span>}
            <span className="font-bold text-sm"><CountUp end={movie.rating} decimals={1} /></span>
          </span>
        )}
        <button
          className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100 max-sm:opacity-100"
          onClick={() => onRemove(movie.id)} title={t("watched.remove")}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
});
