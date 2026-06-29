import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import { Badge } from "../ui/badge";
import { translateGenres } from "../../utils/genre";
import { formatSeasonLabel } from "../../utils/groupTVSeries";
import CountUp from "../CountUp";
import { Film, Star, AlertCircle, Search, Sparkles, Loader2, Trash2, Check, Info, ChevronRight, Heart } from "lucide-react";

/* ── Mobile Card Row ──────────────────────────────────────────── */
export const ManageMobileCard = memo(function ManageMobileCard({ movie, isSelected, enrichingIds, onToggle, onConfirmDelete, onSetDetailMovie, onSetRematchMovie, onEnrich, onSetMarkWatchedMovie, onStartInlineEdit }: {
  movie: MediaDetail;
  isSelected: boolean;
  enrichingIds: Set<number>;
  onToggle: (id: number) => void;
  onConfirmDelete: (movieId: number, title: string) => void;
  onSetDetailMovie: (movie: MediaDetail) => void;
  onSetRematchMovie: (movie: MediaDetail) => void;
  onEnrich: (id: number) => Promise<void>;
  onSetMarkWatchedMovie: (movie: MediaDetail) => void;
  onStartInlineEdit: (movieId: number, field: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`p-3 rounded-xl transition-all duration-200 ${isSelected ? "ring-1 ring-primary/40" : ""}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}
    >
      {/* Row 1: Checkbox + Poster + Title/Meta + Rating */}
      <div className="flex items-start gap-2.5">
        <input type="checkbox"
          className="shrink-0 w-5 h-5 accent-primary cursor-pointer mt-1"
          checked={isSelected} onChange={() => onToggle(movie.id)} />

        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer"
          style={{ border: "1px solid var(--border-subtle)" }}
          onClick={() => onSetDetailMovie(movie)}
        >
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <Film size={16} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate" onClick={() => onSetDetailMovie(movie)}>{movie.title}</span>
                {movie.media_type === "tv" && (
                  <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/80">
                {movie.year && <span>{movie.year}</span>}
                {movie.genre && (
                  <span className="truncate">{translateGenres(movie.genre)}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {/* Status badge */}
                {movie.status === "wish" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-pink px-1.5 py-0.5 rounded-full bg-pink/10 border border-pink/20">
                    <Heart size={10} />
                    {t("manage.status_wish")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green px-1.5 py-0.5 rounded-full bg-green/10 border border-green/20">
                    <Check size={10} />
                    {t("manage.status_watched")}
                  </span>
                )}
                {/* Rating */}
                {movie.status === "watched" && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber tabular-nums">
                    <Star size={10} fill="currentColor" />
                    <CountUp end={movie.rating} decimals={1} />
                  </span>
                )}
                {/* Season info */}
                {movie.season_number != null && (
                  <Badge variant="outline" className="text-[9px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0">
                    {formatSeasonLabel(movie.season_number, t("season_specials"))}{movie.episode_count != null && <span className="ml-0.5 opacity-70">· {movie.episode_count}ep</span>}
                  </Badge>
                )}
                {/* Scrape error indicator */}
                {movie.scrape_error && !movie.poster_url && (
                  <span title={movie.scrape_error} className="shrink-0">
                    <AlertCircle size={11} className="text-destructive" />
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={14} className="shrink-0 mt-0.5" style={{ color: "var(--fg-dim)" }} />
          </div>
        </div>
      </div>

      {/* Row 2: Action buttons */}
      <div className="flex items-center gap-1 mt-2.5 pt-2.5 overflow-x-auto no-scrollbar" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {movie.status === "wish" && (
          <MobileActionBtn
            icon={<Check size={13} />}
            label={t("wishlist.mark_as_watched")}
            onClick={() => onSetMarkWatchedMovie(movie)}
            className="text-green hover:bg-green/10"
          />
        )}
        <MobileActionBtn
          icon={<Info size={13} />}
          label={t("manage.detail")}
          onClick={() => onSetDetailMovie(movie)}
        />

        <MobileActionBtn
          icon={<Search size={13} />}
          label={t("manage.rematch")}
          onClick={() => onSetRematchMovie(movie)}
          className={movie.scrape_error ? "text-amber" : ""}
        />
        <MobileActionBtn
          icon={enrichingIds.has(movie.id) ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          label={t("manage.enrich")}
          onClick={() => onEnrich(movie.id)}
          disabled={enrichingIds.has(movie.id)}
          className={enrichingIds.has(movie.id) ? "text-primary" : "hover:text-amber"}
        />
        <MobileActionBtn
          icon={<Trash2 size={13} />}
          label={t("common.delete")}
          onClick={() => onConfirmDelete(movie.id, movie.title)}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        />
      </div>
    </div>
  );
}, (prev, next) => {
  const id = prev.movie.id;
  if (prev.movie.title !== next.movie.title) return false;
  if (prev.movie.rating !== next.movie.rating) return false;
  if (prev.movie.year !== next.movie.year) return false;
  if (prev.movie.genre !== next.movie.genre) return false;
  if (prev.movie.status !== next.movie.status) return false;
  if (prev.movie.poster_url !== next.movie.poster_url) return false;
  if (prev.movie.scrape_error !== next.movie.scrape_error) return false;
  if (prev.movie.media_type !== next.movie.media_type) return false;
  if (prev.movie.season_number !== next.movie.season_number) return false;
  if (prev.movie.episode_count !== next.movie.episode_count) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.enrichingIds.has(id) !== next.enrichingIds.has(id)) return false;
  return true;
});

/* ── Mobile action button helper ─────────────────────────────── */
function MobileActionBtn({ icon, label, onClick, disabled, className }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none ${className || ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
