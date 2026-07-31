import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../../types";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, Info, X, ListTodo } from "lucide-react";
import { Badge } from "../../ui/badge";
import { translateGenres } from "../../../utils/genre";
import { RatingSlider } from "../../shared/RatingSlider";
import { useRatingEditor } from "../../../hooks/useRatingEditor";

/* ── Mobile card with large poster on the left, info + rating on the right ── */
export const WatchedMobileCard = memo(function WatchedMobileCard({ movie, onRemove, onSaveRating, onOpenDetail, onAddToPlaylist }: {
  movie: MediaDetail;
  onRemove: (id: number) => void;
  onSaveRating: (id: number, rating: number) => Promise<void>;
  onOpenDetail: (movie: MediaDetail) => void;
  onAddToPlaylist?: (movie: MediaDetail) => void;
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
    <div className="flex items-stretch rounded-xl overflow-hidden transition-all duration-200 bg-bg-card border border-border animate-stream">
      {/* Poster — fills full height on the left */}
      <div
        className="w-[88px] shrink-0 overflow-hidden cursor-pointer relative bg-muted/40"
        onClick={() => onOpenDetail(movie)}
      >
        {movie.poster_url ? (
          <ProgressiveImage
            src={movie.poster_url}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={22} className="text-muted-foreground/20" />
          </div>
        )}
        {/* Subtle gradient overlay on right edge blending into info */}
        <div className="absolute inset-y-0 right-0 w-4 pointer-events-none"
          style={{ background: `linear-gradient(to right, transparent, var(--bg-card))` }}
        />
      </div>

      {/* Info + Actions */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-2.5 pl-3 pr-2.5 gap-1">
        {/* Top: Title + meta */}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate" onClick={() => onOpenDetail(movie)}>{movie.title}</span>
            {movie.media_type === "tv" && (
              <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/70">
            {movie.year && <span>{movie.year}</span>}
            {movie.genre && <span className="truncate max-w-[100px]">{translateGenres(movie.genre)}</span>}
            {movie.runtime && <span className="whitespace-nowrap">{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
          </div>
        </div>

        {/* Bottom: Rating + action buttons */}
        <div className="flex items-center justify-between gap-1">
          {/* Rating */}
          {editing ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {onAddToPlaylist && (
              <button
                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-all"
                onClick={() => onAddToPlaylist(movie)}
                title={t("playlists.add_to_playlist")}
              >
                <ListTodo size={13} />
              </button>
            )}
            <button
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/30 hover:text-sky hover:bg-sky/10 transition-all"
              onClick={() => onOpenDetail(movie)}
              title={t("manage.detail")}
            >
              <Info size={13} />
            </button>
            <button
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-all"
              onClick={() => onRemove(movie.id)}
              title={t("watched.remove")}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  if (prev.movie.title !== next.movie.title) return false;
  if (prev.movie.rating !== next.movie.rating) return false;
  if (prev.movie.year !== next.movie.year) return false;
  if (prev.movie.genre !== next.movie.genre) return false;
  if (prev.movie.poster_url !== next.movie.poster_url) return false;
  if (prev.movie.media_type !== next.movie.media_type) return false;
  if (prev.movie.season_number !== next.movie.season_number) return false;
  if (prev.movie.episode_count !== next.movie.episode_count) return false;
  if (prev.movie.runtime !== next.movie.runtime) return false;
  return true;
});
