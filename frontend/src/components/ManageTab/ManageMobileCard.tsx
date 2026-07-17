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
      className={`p-3 rounded-xl transition-all duration-200 bg-bg-card border ${
        isSelected
          ? "border-primary/30 bg-primary/[0.03] ring-1 ring-primary/20"
          : "border-border hover:border-border/80 hover:shadow-sm"
      }`}
    >
      {/* Row 1: Checkbox + Poster + Title/Meta + Rating */}
      <div className="flex items-start gap-2.5">
        <input type="checkbox"
          className="shrink-0 w-5 h-5 accent-primary cursor-pointer mt-1 rounded"
          checked={isSelected} onChange={() => onToggle(movie.id)} />

        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/40 flex items-center justify-center cursor-pointer border border-border/40 shadow-sm"
          onClick={() => onSetDetailMovie(movie)}
        >
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <Film size={16} className="text-muted-foreground/20" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate leading-snug" onClick={() => onSetDetailMovie(movie)}>{movie.title}</span>
                {movie.media_type === "tv" && (
                  <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/70">
                {movie.year && <span className="tabular-nums">{movie.year}</span>}
                {movie.genre && (
                  <span className="truncate">{translateGenres(movie.genre)}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {/* Status badge */}
                {movie.status === "wish" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-pink px-2 py-0.5 rounded-full bg-pink/8 border border-pink/15">
                    <Heart size={9} />
                    <span>{t("manage.status_wish")}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green px-2 py-0.5 rounded-full bg-green/8 border border-green/15">
                    <Check size={9} />
                    <span>{t("manage.status_watched")}</span>
                  </span>
                )}
                {/* Rating */}
                {movie.status === "watched" && movie.rating > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber tabular-nums">
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
                    <AlertCircle size={10} className="text-destructive/70" />
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={14} className="shrink-0 mt-0.5 text-muted-foreground/30" />
          </div>
        </div>
      </div>

      {/* Row 2: Action buttons */}
      <div className="flex items-center gap-1 mt-3 pt-2.5 overflow-x-auto no-scrollbar" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {movie.status === "wish" && (
          <MobileActionBtn
            icon={<Check size={12} />}
            label={t("wishlist.mark_as_watched")}
            onClick={() => onSetMarkWatchedMovie(movie)}
            className="text-green hover:bg-green/10"
          />
        )}
        <MobileActionBtn
          icon={<Info size={12} />}
          label={t("manage.detail")}
          onClick={() => onSetDetailMovie(movie)}
        />
        <MobileActionBtn
          icon={<Search size={12} />}
          label={t("manage.rematch")}
          onClick={() => onSetRematchMovie(movie)}
          className={movie.scrape_error ? "text-amber" : ""}
        />
        <MobileActionBtn
          icon={enrichingIds.has(movie.id) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          label={t("manage.enrich")}
          onClick={() => onEnrich(movie.id)}
          disabled={enrichingIds.has(movie.id)}
          className={enrichingIds.has(movie.id) ? "text-primary" : "hover:text-amber"}
        />
        <MobileActionBtn
          icon={<Trash2 size={12} />}
          label={t("common.delete")}
          onClick={() => onConfirmDelete(movie.id, movie.title)}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
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
