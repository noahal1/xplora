import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import type { TVSeriesGroup } from "../../utils/groupTVSeries";
import { formatSeasonLabel } from "../../utils/groupTVSeries";
import { Badge } from "../ui/badge";
import { translateGenres } from "../../utils/genre";
import {
  Film, Search, Sparkles, Trash2, Info, ChevronDown, ChevronRight,
  Star, Loader2, AlertCircle, Heart, Check,
} from "lucide-react";
import { TableEditableCell } from "./TableEditableCell";
import CountUp from "../CountUp";
import { ActionBtn } from "./ActionBtn";

interface TVSeriesManageRowProps {
  group: TVSeriesGroup;
  isSelected: boolean;
  selected: Set<number>;
  editingCell: { movieId: number; field: string } | null;
  sliderValue: number;
  enrichingIds: Set<number>;
  onToggleGroup: (tvSeriesId: string) => void;
  onToggle: (id: number) => void;
  onOpenDetail: (movie: MediaDetail) => void;
  onSetRematchMovie: (movie: MediaDetail) => void;
  onEnrich: (id: number) => Promise<void>;
  onRemoveGroup: (seasonIds: number[]) => void;
  onConfirmDelete: (movieId: number, title: string) => void;
  onSetMarkWatchedMovie: (movie: MediaDetail) => void;
  onStartInlineEdit: (movieId: number, field: string) => void;
  onSaveInlineEdit: (movieId: number, field: string, value: string) => Promise<void>;
  onCancelEdit: () => void;
}

export const TVSeriesManageRow = memo(function TVSeriesManageRow({
  group,
  isSelected,
  selected,
  editingCell,
  sliderValue,
  enrichingIds,
  onToggleGroup,
  onToggle,
  onOpenDetail,
  onSetRematchMovie,
  onEnrich,
  onRemoveGroup,
  onConfirmDelete,
  onSetMarkWatchedMovie,
  onStartInlineEdit,
  onSaveInlineEdit,
  onCancelEdit,
}: TVSeriesManageRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const firstSeason = group.seasons[0];
  const avgRating =
    group.seasons.reduce((sum, s) => sum + s.rating, 0) / group.seasons.length;
  const years = group.seasons
    .map((s) => s.year)
    .filter((y): y is number => y != null);
  const yearRange =
    years.length > 0
      ? years.length === 1
        ? String(years[0])
        : `${Math.min(...years)}–${Math.max(...years)}`
      : "—";
  const dates = group.seasons
    .map((s) => s.created_at)
    .filter(Boolean)
    .sort();
  const dateRange =
    dates.length > 0
      ? dates.length === 1
        ? dates[0].slice(0, 10)
        : `${dates[0].slice(0, 10)}…`
      : "—";
  const genre = firstSeason.genre;
  const hasEnrichError = group.seasons.some((s) => s.scrape_error && !s.poster_url);
  const anyEnriching = group.seasons.some((s) => enrichingIds.has(s.id));

  return (
    <>
      {/* ── Group header row ── */}
      <tr className={`transition-all duration-150 ${isSelected ? "bg-primary/[0.04]" : "hover:bg-accent/15"}`}>
        {/* Checkbox */}
        <td className="px-3 py-2.5 border-b border-border/60 text-center">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary cursor-pointer rounded"
            checked={isSelected}
            onChange={() => onToggleGroup(group.tvSeriesId)}
          />
        </td>

        {/* Poster */}
        <td className="px-1 py-2.5 border-b border-border/60 text-center">
          <div
            className="relative w-[38px] h-[52px] rounded-lg overflow-hidden bg-muted/40 flex items-center justify-center mx-auto cursor-pointer border border-border/30 shadow-sm"
            onClick={() => onOpenDetail(firstSeason)}
          >
            {group.posterUrl ? (
              <img
                src={group.posterUrl}
                alt={group.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Film size={14} className="text-muted-foreground/20" />
            )}
            {hasEnrichError && (
              <div className="absolute bottom-0.5 right-0.5">
                <AlertCircle size={11} className="text-destructive/70" />
              </div>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5 border-b border-border/60">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky px-2 py-0.5 rounded-full bg-sky/8 border border-sky/15">
            TV
          </span>
        </td>

        {/* Title + Season chips + expand toggle */}
        <td className="px-3 py-2.5 border-b border-border/60">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors p-0.5 -ml-1"
              title={expanded ? t("manage.filter_collapse") : t("manage.filter_expand")}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <span className="font-medium text-sm truncate" title={group.title}>
              {group.title}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1 ml-4">
            {group.seasons.map((season) => (
              <button
                key={season.id}
                onClick={() => onOpenDetail(season)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-all hover:scale-[1.04] active:scale-95 cursor-pointer bg-accent/30 border border-border/30 hover:border-border/60 hover:shadow-sm"
                title={season.title}
              >
                <span className="text-amber text-[9px]">★</span>
                <span>{formatSeasonLabel(season.season_number, t("season_specials"))}</span>
                <span className="text-amber font-semibold">
                  {season.rating.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        </td>

        {/* Rating (avg) */}
        <td className="px-3 py-2.5 border-b border-border/60">
          <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
            <Star size={12} fill="currentColor" className="text-amber" />
            <span>{avgRating.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground/50 ml-0.5">avg</span>
          </span>
        </td>

        {/* Episode count */}
        <td className="px-3 py-2.5 border-b border-border/60">
          <span className="text-muted-foreground text-xs tabular-nums">—</span>
        </td>

        {/* Year range */}
        <td className="px-3 py-2.5 border-b border-border/60">
          <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">{yearRange}</span>
        </td>

        {/* Genre */}
        <td className="px-3 py-2.5 border-b border-border/60">
          <span className="text-muted-foreground truncate block text-xs">
            {translateGenres(genre) || "—"}
          </span>
        </td>

        {/* Date */}
        <td className="px-3 py-2.5 border-b border-border/60">
          <span className="text-muted-foreground text-[11px] whitespace-nowrap tabular-nums">{dateRange}</span>
        </td>

        {/* Actions */}
        <td className="px-1 py-2.5 border-b border-border/60 text-center whitespace-nowrap">
          <div className="inline-flex items-center gap-px rounded-lg p-0.5 bg-accent/20 border border-border/30" style={{ borderRadius: "8px" }}>
            <ActionBtn icon={<Info size={13} />} label={t("manage.detail")}
              onClick={() => onOpenDetail(firstSeason)} color="sky" />
            <ActionBtn
              icon={anyEnriching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              label={anyEnriching ? t("manage.enriching") : t("manage.enrich")}
              onClick={() => Promise.all(group.seasons.map((s) => onEnrich(s.id)))}
              disabled={anyEnriching}
              color="amber"
              highlight={anyEnriching} />
            <ActionBtn icon={<Trash2 size={13} />} label={t("watched.remove_all_seasons")}
              onClick={() => onRemoveGroup(group.seasons.map((s) => s.id))} color="destructive" />
          </div>
        </td>
      </tr>

      {/* ── Expanded season detail rows ── */}
      {expanded && group.seasons.map((season) => (
        <tr
          key={season.id}
          className={`transition-all duration-150 ${editingCell?.movieId === season.id ? "bg-primary/[0.03]" : "hover:bg-accent/10"}`}
        >
          {/* Checkbox (individual season) */}
          <td className="px-3 py-1.5 border-b border-border/40 text-center">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-primary cursor-pointer rounded"
              checked={selected.has(season.id)}
              onChange={() => onToggle(season.id)}
            />
          </td>

          {/* Poster (season poster) */}
          <td className="px-1 py-1.5 border-b border-border/40 text-center">
            {season.poster_url && (
              <div className="relative w-[30px] h-[40px] rounded-md overflow-hidden bg-muted/40 mx-auto border border-border/20 shadow-sm">
                <img src={season.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            )}
          </td>

          {/* Status */}
          <td className="px-3 py-1.5 border-b border-border/40">
            {season.status === "wish" ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-medium text-pink px-1.5 py-0.5 rounded-full bg-pink/8 border border-pink/15">
                <Heart size={9} />
                {t("manage.status_wish")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9px] font-medium text-green px-1.5 py-0.5 rounded-full bg-green/8 border border-green/15">
                <Check size={9} />
                {t("manage.status_watched")}
              </span>
            )}
          </td>

          {/* Title (editable) */}
          <TableEditableCell movie={season} field="title" editingCell={editingCell} sliderValue={sliderValue}
            onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
            tdClassName="!py-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium truncate">{season.title}</span>
              <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 shrink-0 leading-none px-1">
                {formatSeasonLabel(season.season_number, t("season_specials"))}
              </Badge>
    
            </div>
          </TableEditableCell>

          {/* Rating (editable) */}
          <TableEditableCell movie={season} field="rating" editingCell={editingCell} sliderValue={sliderValue}
            onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
            tdClassName="!py-1">
            <span className="inline-flex items-center gap-1 font-medium text-xs">
              <Star size={10} fill="currentColor" className="text-amber" />
              <CountUp end={season.rating} decimals={1} />
            </span>
          </TableEditableCell>

          {/* Episode count (editable) */}
          <TableEditableCell movie={season} field="episode_count" editingCell={editingCell} sliderValue={sliderValue}
            onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
            tdClassName="!py-1">
            <span className="text-xs text-muted-foreground tabular-nums">
              {season.episode_count != null ? `${season.episode_count}ep` : "—"}
            </span>
          </TableEditableCell>

          {/* Year (editable) */}
          <TableEditableCell movie={season} field="year" editingCell={editingCell} sliderValue={sliderValue}
            onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
            tdClassName="!py-1">
            <span className="text-muted-foreground text-xs">{season.year || "—"}</span>
          </TableEditableCell>

          {/* Genre (editable) */}
          <TableEditableCell movie={season} field="genre" editingCell={editingCell} sliderValue={sliderValue}
            onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
            tdClassName="!py-1">
            <span className="text-muted-foreground text-[11px] truncate block">
              {translateGenres(season.genre) || "—"}
            </span>
          </TableEditableCell>

          {/* Date (editable) */}
          <TableEditableCell movie={season} field="created_at" editingCell={editingCell} sliderValue={sliderValue}
            onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
            tdClassName="!py-1">
            <span className="text-muted-foreground text-[10px] whitespace-nowrap tabular-nums">
              {season.created_at ? season.created_at.slice(0, 10) : "—"}
            </span>
          </TableEditableCell>

          {/* Actions */}
          <td className="px-1 py-1.5 border-b border-border/40 text-center whitespace-nowrap">
            <div className="inline-flex items-center gap-px rounded-md p-0.5 bg-accent/20 border border-border/20">
              {season.status === "wish" && (
                <ActionBtn icon={<Check size={11} />} label={t("wishlist.mark_as_watched")}
                  onClick={() => onSetMarkWatchedMovie(season)} color="green" size="sm" />
              )}
              <ActionBtn icon={<Info size={11} />} label={t("manage.detail")}
                onClick={() => onOpenDetail(season)} color="sky" size="sm" />
              <ActionBtn icon={<Search size={11} />} label={season.scrape_error ? t("manage.rematch_error_hint") : t("manage.rematch")}
                onClick={() => onSetRematchMovie(season)} color="sky" highlight={!!season.scrape_error} size="sm" />
              <ActionBtn
                icon={enrichingIds.has(season.id) ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                label={enrichingIds.has(season.id) ? t("manage.enriching") : t("manage.enrich")}
                onClick={() => onEnrich(season.id)} disabled={enrichingIds.has(season.id)}
                color="amber" highlight={enrichingIds.has(season.id)} size="sm" />
              <ActionBtn icon={<Trash2 size={11} />} label={t("common.delete")}
                onClick={() => onConfirmDelete(season.id, season.title)} color="destructive" size="sm" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
});
