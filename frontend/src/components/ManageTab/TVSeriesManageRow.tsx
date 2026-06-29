import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import type { TVSeriesGroup } from "../../utils/groupTVSeries";
import { Badge } from "../ui/badge";
import { translateGenres } from "../../utils/genre";
import {
  Film, Search, Sparkles, Trash2, Info, ChevronDown, ChevronRight,
  Star, Loader2, AlertCircle, Heart, Check,
} from "lucide-react";
import { TableEditableCell } from "./TableEditableCell";
import CountUp from "../CountUp";

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
      <tr className={`transition-colors ${isSelected ? "bg-primary/[0.04]" : "hover:bg-accent/20"}`}>
        {/* Checkbox */}
        <td className="px-3 py-2 border-b border-border text-center">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary cursor-pointer"
            checked={isSelected}
            onChange={() => onToggleGroup(group.tvSeriesId)}
          />
        </td>

        {/* Poster */}
        <td className="px-1 py-2 border-b border-border text-center">
          <div
            className="relative w-[38px] h-[52px] rounded overflow-hidden bg-muted flex items-center justify-center mx-auto cursor-pointer"
            style={{ border: "1px solid var(--border-subtle)" }}
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
              <Film size={14} className="text-muted-foreground/30" />
            )}
            {hasEnrichError && (
              <div className="absolute bottom-0.5 right-0.5">
                <AlertCircle size={12} className="text-destructive" />
              </div>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-2 border-b border-border">
          <span className="inline-flex items-center gap-1 text-[11px] text-sky px-1.5 py-0.5 rounded-full bg-sky/10 border border-sky/20">
            TV
          </span>
        </td>

        {/* Title + Season chips + expand toggle */}
        <td className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors p-0.5 -ml-1"
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
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all hover:scale-[1.04] active:scale-95 cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                }}
                title={season.title}
              >
                <span className="text-amber text-[9px]">★</span>
                <span>S{season.season_number ?? "?"}</span>
                <span className="text-amber font-semibold">
                  {season.rating.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        </td>

        {/* Rating (avg) */}
        <td className="px-3 py-2 border-b border-border">
          <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
            <Star size={12} fill="currentColor" className="text-amber" />
            <span>{avgRating.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground/60 ml-0.5">avg</span>
          </span>
        </td>

        {/* Year range */}
        <td className="px-3 py-2 border-b border-border">
          <span className="text-muted-foreground text-xs">{yearRange}</span>
        </td>

        {/* Genre */}
        <td className="px-3 py-2 border-b border-border">
          <span className="text-muted-foreground truncate block text-xs">
            {translateGenres(genre) || "—"}
          </span>
        </td>

        {/* Date */}
        <td className="px-3 py-2 border-b border-border">
          <span className="text-muted-foreground text-[11px]">{dateRange}</span>
        </td>

        {/* Actions */}
        <td className="px-1 py-2 border-b border-border text-center whitespace-nowrap">
          <div
            className="inline-flex items-center gap-0.5"
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--seed-radius)",
              padding: "1px",
            }}
          >
            <button
              className="text-muted-foreground hover:text-sky px-1.5 py-1 rounded transition-colors hover:bg-sky/10"
              onClick={() => onOpenDetail(firstSeason)}
              title={t("manage.detail")}
            >
              <Info size={14} />
            </button>
            <button
              className={`px-1.5 py-1 rounded transition-colors ${anyEnriching ? "text-primary animate-pulse" : "text-muted-foreground hover:text-amber"} hover:bg-amber/10`}
              onClick={() => Promise.all(group.seasons.map((s) => onEnrich(s.id)))}
              disabled={anyEnriching}
              title={anyEnriching ? t("manage.enriching") : t("manage.enrich")}
            >
              {anyEnriching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            </button>
            <button
              className="text-muted-foreground hover:text-destructive px-1.5 py-1 rounded transition-colors hover:bg-destructive/10"
              onClick={() => onRemoveGroup(group.seasons.map((s) => s.id))}
              title={t("watched.remove_all_seasons")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>

      {/* ── Expanded season detail rows ── */}
      {expanded && group.seasons.map((season) => (
        <tr
          key={season.id}
          className={`transition-colors ${editingCell?.movieId === season.id ? "bg-primary/[0.03]" : "hover:bg-accent/10"}`}
        >
          {/* Checkbox (individual season) */}
          <td className="px-3 py-1.5 border-b border-border/50 text-center">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-primary cursor-pointer"
              checked={selected.has(season.id)}
              onChange={() => onToggle(season.id)}
            />
          </td>

          {/* Poster (season poster) */}
          <td className="px-1 py-1.5 border-b border-border/50 text-center">
            {season.poster_url && (
              <div className="relative w-[30px] h-[40px] rounded overflow-hidden bg-muted mx-auto"
                style={{ border: "1px solid var(--border-subtle)" }}>
                <img src={season.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            )}
          </td>

          {/* Status */}
          <td className="px-3 py-1.5 border-b border-border/50">
            {season.status === "wish" ? (
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
          </td>

          {/* Title (editable) */}
          <TableEditableCell movie={season} field="title" editingCell={editingCell} sliderValue={sliderValue}
            onStartEdit={onStartInlineEdit} onSaveEdit={onSaveInlineEdit} onCancelEdit={onCancelEdit}
            tdClassName="!py-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium truncate">{season.title}</span>
              <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 shrink-0 leading-none px-1">
                S{season.season_number}
              </Badge>
              {season.episode_count != null && (
                <span className="text-[9px] text-muted-foreground/60 shrink-0">
                  · {season.episode_count}ep
                </span>
              )}
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
            <span className="text-muted-foreground text-[10px]">
              {season.created_at ? season.created_at.slice(0, 10) : "—"}
            </span>
          </TableEditableCell>

          {/* Actions */}
          <td className="px-1 py-1.5 border-b border-border/50 text-center whitespace-nowrap">
            <div className="inline-flex items-center gap-0.5"
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--seed-radius)",
                padding: "1px",
              }}>
              {season.status === "wish" && (
                <button className="text-muted-foreground hover:text-green px-1 py-0.5 rounded transition-colors hover:bg-green/10"
                  onClick={() => onSetMarkWatchedMovie(season)} title={t("wishlist.mark_as_watched")}>
                  <Check size={12} />
                </button>
              )}
              <button className="text-muted-foreground hover:text-sky px-1 py-0.5 rounded transition-colors hover:bg-sky/10"
                onClick={() => onOpenDetail(season)} title={t("manage.detail")}>
                <Info size={12} />
              </button>
              <button className={`px-1 py-0.5 rounded transition-colors ${season.scrape_error ? "text-amber" : "text-muted-foreground"} hover:text-sky hover:bg-sky/10`}
                onClick={() => onSetRematchMovie(season)}
                title={season.scrape_error ? t("manage.rematch_error_hint") : t("manage.rematch")}>
                <Search size={12} />
              </button>
              <button className={`px-1 py-0.5 rounded transition-colors ${enrichingIds.has(season.id) ? "text-primary animate-pulse" : "text-muted-foreground hover:text-amber"} hover:bg-amber/10`}
                onClick={() => onEnrich(season.id)} disabled={enrichingIds.has(season.id)}
                title={enrichingIds.has(season.id) ? t("manage.enriching") : t("manage.enrich")}>
                {enrichingIds.has(season.id) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              </button>
              <button className="text-muted-foreground hover:text-destructive px-1 py-0.5 rounded transition-colors hover:bg-destructive/10"
                onClick={() => onConfirmDelete(season.id, season.title)} title={t("common.delete")}>
                <Trash2 size={12} />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
});
