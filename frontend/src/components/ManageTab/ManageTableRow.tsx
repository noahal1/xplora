import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import { Badge } from "../ui/badge";
import { translateGenres } from "../../utils/genre";
import { formatSeasonLabel } from "../../utils/groupTVSeries";
import CountUp from "../CountUp";
import { Film, AlertCircle, Star, Search, Sparkles, Loader2, Trash2, Check, Info, Heart } from "lucide-react";
import { TableEditableCell } from "./TableEditableCell";
import { ActionBtn } from "./ActionBtn";

export const ManageTableRow = memo(function ManageTableRow({ 
  movie, 
  isSelected, 
  editingCell, 
  sliderValue, 
  enrichingIds,
  onToggle, 
  onConfirmDelete, 
  onSetDetailMovie, 
  onSetRematchMovie, 
  onEnrich, 
  onSetMarkWatchedMovie, 
  onStartInlineEdit, 
  onSaveInlineEdit,
  onCancelEdit
}: {
  movie: MediaDetail;
  isSelected: boolean;
  editingCell: { movieId: number; field: string } | null;
  sliderValue: number;
  enrichingIds: Set<number>;
  onToggle: (id: number) => void;
  onConfirmDelete: (movieId: number, title: string) => void;
  onSetDetailMovie: (movie: MediaDetail) => void;
  onSetRematchMovie: (movie: MediaDetail) => void;
  onEnrich: (id: number) => Promise<void>;
  onSetMarkWatchedMovie: (movie: MediaDetail) => void;
  onStartInlineEdit: (movieId: number, field: string) => void;
  onSaveInlineEdit: (movieId: number, field: string, value: string) => Promise<void>;
  onCancelEdit: () => void;
}) {
  const { t } = useTranslation();

  const isEditing = editingCell?.movieId === movie.id;

  return (
    <tr className={`transition-all duration-150 ${isSelected ? "bg-primary/[0.04]" : "hover:bg-accent/15"} ${isEditing ? "ring-1 ring-primary/20 ring-inset" : ""}`}>
      <td className="px-3 max-sm:px-2 py-2.5 border-b border-border/60 text-center">
        <input type="checkbox" className="w-4 h-4 max-sm:w-5 max-sm:h-5 accent-primary cursor-pointer rounded"
          checked={isSelected} onChange={() => onToggle(movie.id)} />
      </td>
      <td className="px-1 max-sm:hidden py-2.5 border-b border-border/60 text-center">
        <div className="relative w-[38px] h-[52px] rounded-lg overflow-hidden bg-muted/40 flex items-center justify-center mx-auto border border-border/30 shadow-sm">
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : null}
          <Film size={14} className={`text-muted-foreground/20 ${movie.poster_url ? "hidden" : ""}`} />
          {movie.scrape_error && !movie.poster_url && (
            <div className="absolute bottom-0.5 right-0.5 group">
              <AlertCircle size={11} className="text-destructive/70 cursor-help" />
              <div className="absolute bottom-full right-0 mb-1.5 w-56 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] leading-relaxed shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                <span className="font-semibold">{t("manage.scrape_error_label")}</span><br />{movie.scrape_error}
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="px-3 max-sm:px-2 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-1.5">
          {movie.status === "wish" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-pink px-2 py-0.5 rounded-full bg-pink/8 border border-pink/15">
              <Heart size={10} />
              {t("manage.status_wish")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green px-2 py-0.5 rounded-full bg-green/8 border border-green/15">
              <Check size={10} />
              {t("manage.status_watched")}
            </span>
          )}
        </div>
      </td>
      <TableEditableCell movie={movie} field="title" editingCell={editingCell} sliderValue={sliderValue}
        onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium truncate">{movie.title}</span>
          {movie.media_type === "tv" && (
            <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
          )}
          {movie.season_number != null && (
            <Badge variant="outline" className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5 shrink-0">
              {formatSeasonLabel(movie.season_number, t("season_specials"))}{movie.episode_count != null && <span className="ml-0.5 opacity-70">· {movie.episode_count}ep</span>}
            </Badge>
          )}
        </div>
      </TableEditableCell>
      <TableEditableCell movie={movie} field="rating" editingCell={editingCell} sliderValue={sliderValue}
        onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}>
        <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
          <Star size={12} fill="currentColor" />
          <CountUp end={movie.rating} decimals={1} />
        </span>
      </TableEditableCell>
      {/* Episode count (only for TV series) */}
      <td className="px-3 py-2.5 border-b border-border/60 text-muted-foreground text-xs tabular-nums">
        {movie.media_type === "tv" && movie.episode_count != null ? `${movie.episode_count}ep` : "—"}
      </td>
      <TableEditableCell movie={movie} field="year" editingCell={editingCell} sliderValue={sliderValue}
        onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}>
        <span className="text-muted-foreground">{movie.year || "—"}</span>
      </TableEditableCell>
      <TableEditableCell movie={movie} field="genre" editingCell={editingCell} sliderValue={sliderValue}
        onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}>
        <span className="text-muted-foreground truncate block">{translateGenres(movie.genre) || "—"}</span>
      </TableEditableCell>
      <TableEditableCell movie={movie} field="created_at" editingCell={editingCell} sliderValue={sliderValue}
        onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
        tdClassName="max-sm:hidden">
        <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">{movie.created_at ? movie.created_at.slice(0, 10) : "—"}</span>
      </TableEditableCell>
      <td className="px-1 max-sm:px-0.5 py-2.5 border-b border-border/60 text-center whitespace-nowrap">
        <div className="inline-flex items-center gap-px rounded-lg p-0.5 bg-accent/20 border border-border/30" style={{ borderRadius: "8px" }}>
          {movie.status === "wish" && (
            <ActionBtn icon={<Check size={13} />} label={t("wishlist.mark_as_watched")}
              onClick={() => onSetMarkWatchedMovie(movie)} color="green" />
          )}
          <ActionBtn icon={<Info size={13} />} label={t("manage.detail")}
            onClick={() => onSetDetailMovie(movie)} color="sky" />
          <ActionBtn icon={<Search size={13} />} label={movie.scrape_error ? t("manage.rematch_error_hint") : t("manage.rematch")}
            onClick={() => onSetRematchMovie(movie)} color="sky" highlight={!!movie.scrape_error} />
          <ActionBtn
            icon={enrichingIds.has(movie.id) ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            label={enrichingIds.has(movie.id) ? t("manage.enriching") : t("manage.enrich")}
            onClick={() => onEnrich(movie.id)} disabled={enrichingIds.has(movie.id)}
            color="amber" highlight={enrichingIds.has(movie.id)} />
          <ActionBtn icon={<Trash2 size={13} />} label={t("common.delete")}
            onClick={() => onConfirmDelete(movie.id, movie.title)} color="destructive" />
        </div>
      </td>
    </tr>
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
  if (prev.movie.created_at !== next.movie.created_at) return false;
  if (prev.isSelected !== next.isSelected) return false;

  const prevEditing = prev.editingCell?.movieId === id && prev.editingCell?.field === "rating";
  const nextEditing = next.editingCell?.movieId === id && next.editingCell?.field === "rating";
  if (prevEditing !== nextEditing) return false;
  // Only slider changes for THIS row trigger re-render
  if (nextEditing && prev.sliderValue !== next.sliderValue) return false;

  if (prev.enrichingIds.has(id) !== next.enrichingIds.has(id)) return false;
  // Re-render when editing starts, ends, or changes for this row
  if (prev.editingCell?.movieId === id || next.editingCell?.movieId === id) return false;

  return true;
});

