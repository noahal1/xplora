import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail, MediaSearchResult, SortField } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { useEnrich } from "../../context/EnrichContext";
import { Badge } from "../ui/badge";
import { Pagination } from "../Pagination";
import { SkeletonTable } from "../Skeleton";
import { translateGenres } from "../../utils/genre";
import CountUp from "../CountUp";
import { Modal } from "../Modal";
import { GenreFilter } from "../GenreFilter";
import { MediaTypeFilter } from "../MediaTypeFilter";
import { SortControls } from "../SortControls";
import { StatusFilter } from "../StatusFilter";
import { SearchInput } from "../SearchInput";
import { ScrapeSourceFilter } from "../ScrapeSourceFilter";
import FadeContent from "../FadeContent";
import { Film, Upload, Plus, Search, Sparkles, Loader2, RefreshCw, Trash2, WandSparkles, AlertCircle, Star, X, Info, ChevronRight, Check, ChevronDown } from "lucide-react";
import { useDebouncedSearch } from "../../hooks/useDebouncedSearch";
import { useGenreExtractor } from "../../hooks/useGenreExtractor";
import { useSort } from "../../hooks/useSort";
import { useEnrichReload } from "../../hooks/useEnrichReload";

import { EmptyState } from "../EmptyState";
import { SearchImportModal } from "./SearchImportModal";
import { DetailModal } from "./DetailModal";
import { RematchModal } from "./RematchModal";
import { MarkWatchedModal } from "./MarkWatchedModal";
import { GenreEditModal } from "./GenreEditModal";

const MANAGE_PAGE_SIZE = 16;

/* ── Delete confirmation type ─────────────────────────────────── */
type DeleteAction =
  | { type: "single"; movieId: number; title: string }
  | { type: "selected"; count: number }
  | { type: "all"; count: number }
  | null;

export function ManageTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();

  const [mediaList, setMediaList] = useState<MediaDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(0);
  const search = useDebouncedSearch("", 300);
  const { field: sortField, dir: sortDir, toggle: handleSort } = useSort("created_at", "desc");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [errorFilter, setErrorFilter] = useState(false);
  const [mediaTypeFilter, setMediaTypeFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [filtersExpanded, setFiltersExpanded] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640);
  const [editingCell, setEditingCell] = useState<{ movieId: number; field: string } | null>(null);
  const [sliderValue, setSliderValue] = useState(7);
  const [genreDialogMovie, setGenreDialogMovie] = useState<MediaDetail | null>(null);
  const [genreDialogValue, setGenreDialogValue] = useState("");
  const [markWatchedMovie, setMarkWatchedMovie] = useState<MediaDetail | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  /* ── Delete confirmation modal ───────────────────────────────── */
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteAction>(null);

  /* ── TMDB search & import ────────────────────────────────────── */
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  /* ── Metadata detail modal ───────────────────────────────────── */
  const [detailMovie, setDetailMovie] = useState<MediaDetail | null>(null);

  /* ── Manual search & match modal ─────────────────────────────── */
  const [rematchMovie, setRematchMovie] = useState<MediaDetail | null>(null);

  /* ── Enrich source selector ──────────────────────────────────── */
  const [enrichSource, setEnrichSource] = useState<string>("tmdb");

  /* ── Enriching IDs ───────────────────────────────────────────── */
  const [enrichingIds, setEnrichingIds] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async (signal?: AbortSignal, quiet?: boolean) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const data = await api.listMedia({
        search: search.debouncedValue || undefined,
        page,
        page_size: MANAGE_PAGE_SIZE,
        status: statusFilter || undefined,
        sort_field: sortField,
        sort_dir: sortDir,
        has_error: errorFilter || undefined,
        media_type: mediaTypeFilter || undefined,
        genre: genreFilter || undefined,
        signal,
      });
      if (signal?.aborted) return;
      setMediaList(data.media);
      setTotal(data.total);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(err.message);
    } finally {
      if (!signal?.aborted && !quiet) {
        setLoading(false);
      }
    }
  }, [search.debouncedValue, page, statusFilter, mediaTypeFilter, genreFilter, errorFilter, sortField, sortDir]);



  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Auto-refresh when background enrichment completes
  useEnrichReload(() => { fetchData(); });

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && selected.size < mediaList.length;
  }, [selected, mediaList.length]);

  const toggleSelection = useCallback((id: number) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (mediaList.length === 0) return;
    const allSelected = mediaList.every((m) => selected.has(m.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) mediaList.forEach((m) => next.delete(m.id));
      else mediaList.forEach((m) => next.add(m.id));
      return next;
    });
  }, [mediaList, selected]);

  /* ── Delete handlers with modal confirmation ─────────────────── */
  const confirmDelete = useCallback((movieId: number, title: string) => setDeleteConfirm({ type: "single", movieId, title }), []);
  const confirmDeleteSelected = useCallback(() => { if (selected.size > 0) setDeleteConfirm({ type: "selected", count: selected.size }); }, [selected]);
  const confirmDeleteAll = useCallback(() => { if (total > 0) setDeleteConfirm({ type: "all", count: total }); }, [total]);

  const executeDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const action = deleteConfirm;
    setDeleteConfirm(null);
    try {
      if (action.type === "single") {
        await api.deleteMedia(action.movieId);
        showToast(t("manage.deleted"), "success");
        setSelected((prev) => { const next = new Set(prev); next.delete(action.movieId); return next; });
      } else if (action.type === "selected") {
        const ids = Array.from(selected);
        const result = await api.batchDeleteMedia(ids);
        setSelected(new Set());
        showToast(t("manage.deleted_count", { count: result.count }), "success");
      } else if (action.type === "all") {
        await api.deleteAllMedia();
        showToast(t("manage.cleared", { count: action.count }), "success");
        setSelected(new Set());
        setPage(0);
      }
      fetchData(undefined, true);
    } catch (err: any) {
      showToast(t("manage.delete_failed", { message: err.message }), "error");
    }
  }, [deleteConfirm, selected, fetchData, showToast, t]);

  /* ── Inline editing ──────────────────────────────────────────── */
  const startInlineEdit = useCallback((movieId: number, field: string) => {
    if (field === "genre") {
      const item = mediaList.find((m) => m.id === movieId);
      if (item) { setGenreDialogMovie(item); setGenreDialogValue(item.genre || ""); }
      return;
    }
    setEditingCell({ movieId, field });
    if (field === "rating") {
      const item = mediaList.find((m) => m.id === movieId);
      if (item) setSliderValue(item.rating);
    } else {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [mediaList]);

  const cancelInlineEdit = useCallback(() => { setEditingCell(null); }, []);

  const saveInlineEdit = useCallback(async (movieId: number, field: string, value: string) => {
    const movie = mediaList.find((m) => m.id === movieId);
    if (!movie) return;
    let newValue: any = value.trim();
    let updatedFields: Record<string, any> = {};
    switch (field) {
      case "title": if (!newValue) return; updatedFields.title = newValue; break;
      case "rating": newValue = parseFloat(value); if (isNaN(newValue) || newValue < 0 || newValue > 10) return; updatedFields.rating = Math.round(newValue * 10) / 10; break;
      case "year": newValue = value ? parseInt(value) : null; if (value && (isNaN(newValue) || newValue < 1888 || newValue > 2030)) return; updatedFields.year = newValue; break;
      case "created_at": newValue = value || null; updatedFields.created_at = newValue; break;
    }
    const currentVal = movie[field as keyof MediaDetail];
    if (updatedFields[field] === currentVal || (currentVal == null && updatedFields[field] == null)) { cancelInlineEdit(); return; }
    try {
      const updated = await api.updateMedia(movieId, {
        title: updatedFields.title ?? movie.title,
        rating: updatedFields.rating ?? movie.rating,
        year: updatedFields.year !== undefined ? updatedFields.year : movie.year,
        genre: movie.genre || "",
        created_at: updatedFields.created_at !== undefined ? updatedFields.created_at : movie.created_at,
      } as any);
      // Update local state immediately
      setMediaList(prev => prev.map(m => m.id === movieId ? { ...m, ...updated } : m));
      showToast(t("manage.updated"), "success");
      cancelInlineEdit();
      fetchData(undefined, true);
    } catch (err: any) { showToast(t("manage.save_failed", { message: err.message }), "error"); cancelInlineEdit(); }
  }, [mediaList, fetchData, showToast, cancelInlineEdit, t]);

  /* ── Enrich operations ───────────────────────────────────────── */
  const openSearchDialog = useCallback(() => { setSearchDialogOpen(true); }, []);

  const handleEnrich = useCallback(async (movieId: number) => {
    setEnrichingIds(prev => new Set(prev).add(movieId));
    try {
      const updated = await api.enrichMedia(movieId, enrichSource);
      // Update poster/metadata immediately
      setMediaList(prev => prev.map(m => m.id === movieId ? { ...m, ...updated } : m));
      showToast(t("manage.enrich_success"), "success");
      fetchData(undefined, true);
    } catch (err: any) { showToast(t("manage.enrich_failed", { message: err.message }), "error"); }
    finally { setEnrichingIds(prev => { const next = new Set(prev); next.delete(movieId); return next; }); }
  }, [fetchData, showToast, t, enrichSource]);

  /* ── Batch enrich + cache ───────────────────────────────────── */
  const [batchLoading, setBatchLoading] = useState(false);

  const handleBatchAll = useCallback(async () => {
    setBatchLoading(true);
    try {
      const enrichResult = await api.enrichAllMedia();
      let totalEnqueued = enrichResult.enqueued;
      const cacheResult = await api.cachePosters();
      totalEnqueued += cacheResult.enqueued;
      if (totalEnqueued > 0) {
        showToast(t("manage.batch_all_started", { count: totalEnqueued }), "success");
        startPolling();
      } else showToast(t("manage.batch_all_none"), "info");
    } catch (err: any) { showToast(t("manage.batch_all_failed", { message: err.message }), "error"); }
    finally { setBatchLoading(false); }
  }, [showToast, startPolling, t]);

  const handleExportMovies = useCallback(async () => {
    try {
      const allData = await api.listMedia({
        page: 0,
        page_size: total || 10000,
        search: search.debouncedValue || undefined,
        status: statusFilter || undefined,
        sort_field: sortField,
        sort_dir: sortDir,
        has_error: errorFilter || undefined,
        media_type: mediaTypeFilter || undefined,
        genre: genreFilter || undefined,
      });
      if (allData.media.length === 0) return;
      const data = JSON.stringify({ movies: allData.media, exported_at: new Date().toISOString(), total: allData.total }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xplora-movies-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast(t("manage.export_failed", { message: err.message }), "error");
    }
  }, [total, search.debouncedValue, statusFilter, sortField, sortDir, errorFilter, mediaTypeFilter, genreFilter, showToast, t]);

  /* ── Pagination helpers ──────────────────────────────────────── */
  const totalPages = Math.ceil(total / MANAGE_PAGE_SIZE);

  // Derive unique genre tags from loaded media list
  const uniqueGenres = useGenreExtractor(mediaList);

  const VISIBLE_GENRES = 6;

  const hasActiveFilters = !!(search.debouncedValue || statusFilter || mediaTypeFilter || genreFilter || errorFilter);

  const SortArrow = ({ field }: { field: SortField }) => {
    return (
      <span className="text-[11px] ml-1 transition-opacity" style={{ opacity: sortField === field ? 1 : 0.25 }}>
        {sortField === field ? (sortDir === "asc" ? "↑" : "↓") : "↓"}
      </span>
    );
  };

  

  return (
    <FadeContent className="section-card min-h-[300px]">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-5">
        <h2 className="section-title flex items-center gap-2 text-base">
          <Film size={16} className="text-primary shrink-0" />
          <span className="truncate">{t("manage.title")}</span>
          <span className="badge font-mono text-xs shrink-0">{t("manage.total", { count: 0 }).replace("0", "")}<CountUp end={total} /></span>
        </h2>
        <div className="flex gap-1.5 items-center flex-wrap w-full sm:w-auto">
          <button className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm" onClick={() => fetchData()} title={t("manage.refresh")}>
            <RefreshCw size={13} /><span className="hidden sm:inline">{t("manage.refresh")}</span>
          </button>
          <button className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm" onClick={handleExportMovies} title={t("manage.export")}>
            <Upload size={13} /><span className="hidden sm:inline">{t("manage.export")}</span>
          </button>
          <button className={`btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm gap-1 sm:gap-1.5 ${batchLoading ? "opacity-50" : ""}`}
            onClick={handleBatchAll} disabled={batchLoading} title={t("manage.batch_all")}>
            {batchLoading ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}
            <span className="hidden sm:inline">{t("manage.batch_all")}</span>
          </button>
          <button className="btn btn-primary btn-xs sm:py-1.5 sm:px-3 sm:text-sm" onClick={openSearchDialog} title={t("manage.add_movie")}>
            <Plus size={13} /><span className="hidden sm:inline">{t("manage.add_movie")}</span>
          </button>
        </div>
      </div>

      {/* ── Search & bulk actions ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
        <SearchInput
          value={search.input}
          onChange={(v) => { search.setInput(v); setPage(0); setSelected(new Set()); }}
          onClear={() => { search.clear(); setPage(0); setSelected(new Set()); }}
          placeholder={t("manage.search_placeholder")}
          showClear={!!search.debouncedValue}
        />
        <div className="flex gap-1.5 shrink-0 w-full sm:w-auto">
          <button className={`btn btn-xs gap-1.5 transition-all flex-1 sm:flex-none justify-center ${selected.size > 0 ? "btn-destructive" : "btn-ghost opacity-50"}`}
            disabled={selected.size === 0} onClick={confirmDeleteSelected}
            title={selected.size > 0 ? t("manage.delete_selected") : undefined}>
            <Trash2 size={12} /><span className="sm:hidden">{t("manage.delete")}</span><span className="hidden sm:inline">{t("manage.delete_selected")}</span>
            {selected.size > 0 && <span className="tabular-nums font-mono"><CountUp end={selected.size} /></span>}
          </button>
          <button className="btn btn-ghost btn-xs gap-1.5 flex-1 sm:flex-none justify-center" onClick={confirmDeleteAll} title={t("manage.clear_all")}>
            <Trash2 size={12} /><span className="hidden sm:inline">{t("manage.clear_all")}</span>
          </button>
        </div>
      </div>

      {/* ── Filter toggle (mobile only) ──────────────────── */}
      <div className="sm:hidden flex items-center gap-2 mb-2">
        <button
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all w-full justify-between"
          style={{
            background: filtersExpanded ? "var(--accent-glow)" : "var(--bg-input)",
            border: `1px solid ${filtersExpanded ? "var(--primary-20)" : "var(--border-subtle)"}`,
          }}
          onClick={() => setFiltersExpanded((v) => !v)}
        >
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="12" y1="18" x2="20" y2="18" />
            </svg>
            <span>{filtersExpanded ? t("manage.filter_collapse") : t("manage.filter_expand")}</span>
          </div>
          <ChevronDown
            size={14}
            className="transition-transform duration-200"
            style={{ transform: filtersExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
      </div>

      {/* ── Filters: collapsible on mobile ────────────────── */}
      {/* Always render on desktop (sm:block), toggle on mobile via hidden/block */}
      <div className={`sm:block ${filtersExpanded ? 'max-sm:block max-sm:animate-slide-down' : 'max-sm:hidden'}`}>
        <div className="flex flex-col gap-0 sm:gap-0">
          {/* Row 1: Status + MediaType + Sort + ScrapeSource (compact) */}
          {/* Row 1: Status + MediaType (spaced groups) */}
          <div className="flex items-start sm:items-center gap-2 sm:gap-1 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar">
            <div className="max-sm:[&>*]:mb-0 shrink-0 flex items-center">
              <StatusFilter
                status={statusFilter}
                error={errorFilter}
                onStatusChange={(v) => { setStatusFilter(v); setErrorFilter(false); setPage(0); setSelected(new Set()); }}
                onErrorToggle={() => { setErrorFilter((v) => !v); setStatusFilter(""); setPage(0); setSelected(new Set()); }}
              />
            </div>
            <div className="flex items-center shrink-0">
              <MediaTypeFilter
                selected={mediaTypeFilter}
                allValue=""
                onSelect={(v) => { setMediaTypeFilter(v); setPage(0); setSelected(new Set()); }}
              />
            </div>
          </div>

          {/* Row 2: Sort + ScrapeSource */}
          <div className="flex items-start sm:items-center gap-0 sm:gap-0 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar">
            <SortControls
              field={sortField}
              dir={sortDir}
              onSort={(f) => { handleSort(f); setPage(0); setSelected(new Set()); }}
            />
            <ScrapeSourceFilter
              selected={enrichSource}
              onSelect={setEnrichSource}
            />
          </div>

          <GenreFilter
            genres={uniqueGenres}
            selected={genreFilter}
            allValue=""
            visibleCount={VISIBLE_GENRES}
            onSelect={(g) => { setGenreFilter(g); setPage(0); setSelected(new Set()); }}
          />
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && <SkeletonTable rows={6} />}

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center"><X size={20} className="text-destructive" /></div>
          <p className="text-sm font-medium text-destructive">{t("manage.load_failed", { message: error })}</p>
          <button className="btn btn-ghost btn-xs gap-1.5" onClick={() => fetchData()}><RefreshCw size={12} />{t("manage.retry")}</button>
        </div>
      )}

      {/* ── Empty (no data, no filters) ───────────────────────── */}
      {!loading && !error && mediaList.length === 0 && !hasActiveFilters && (
        <EmptyState
          icon={<Film size={40} />}
          noDataKey="manage.no_movies"
          noDataActions={
            <button className="btn btn-primary btn-sm gap-1.5" onClick={openSearchDialog}>
              <Plus size={13} />{t("manage.add_movie")}
            </button>
          }
        />
      )}

      {/* ── Empty (filters active, no match) ──────────────────── */}
      {!loading && !error && mediaList.length === 0 && hasActiveFilters && (
        <EmptyState
          hasActiveFilters
          searchQuery={search.debouncedValue}
          onClearFilters={() => {
            search.clear();
            setStatusFilter("");
            setErrorFilter(false);
            setMediaTypeFilter("");
            setGenreFilter("");
            setPage(0);
            setSelected(new Set());
          }}
          noMatchKey={search.debouncedValue ? "manage.no_matching" : "watched.no_match"}
          noMatchSubtextKey={search.debouncedValue ? "manage.try_other" : undefined}
          noDataKey="manage.no_movies"
        />
      )}

      {/* ── Table (desktop) ────────────────────────────────────── */}
      {!loading && !error && mediaList.length > 0 && (
        <div className="max-sm:hidden">
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="w-10 text-center px-3 py-2.5 font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">
                    <input type="checkbox" ref={selectAllRef} className="w-4 h-4 accent-primary cursor-pointer"
                      checked={mediaList.length > 0 && mediaList.every((m) => selected.has(m.id))} onChange={toggleSelectAll} />
                  </th>
                  <th className="w-[52px] px-1 py-2.5 text-center font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none max-sm:hidden">{t("manage.col_poster")}</th>
                  <th className="w-14 px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_status")}</th>
                  {(["title", "rating", "year", "genre", "created_at"] as const).map((field) => {
                    const widths: Record<string, number | undefined> = { title: 200, rating: 140, year: 72, genre: undefined, created_at: 100 };
                    return (
                      <th key={field} className={`px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none cursor-pointer hover:text-foreground transition-colors${field === 'created_at' ? ' max-sm:hidden' : ''}`}
                        style={widths[field] ? { width: widths[field] } : undefined} onClick={() => handleSort(field)}>
                        {field === "title" ? t("manage.col_title") : field === "rating" ? t("manage.col_rating") : field === "year" ? t("manage.col_year") : field === "genre" ? t("manage.col_genre") : t("manage.col_date")}
                        <SortArrow field={field} />
                      </th>
                    );
                  })}
                  <th className="w-[120px] max-sm:w-[160px] text-center px-1 py-2.5 font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {mediaList.map((m) => (
                  <ManageTableRow
                    key={m.id}
                    movie={m}
                    isSelected={selected.has(m.id)}
                    editingCell={editingCell}
                    sliderValue={sliderValue}
                    enrichingIds={enrichingIds}
                    onToggle={toggleSelection}
                    onConfirmDelete={confirmDelete}
                    onSetDetailMovie={setDetailMovie}
                    onSetRematchMovie={setRematchMovie}
                    onEnrich={handleEnrich}
                    onSetMarkWatchedMovie={setMarkWatchedMovie}
                    onStartInlineEdit={startInlineEdit}
                    onSaveInlineEdit={saveInlineEdit}
                    onCancelEdit={cancelInlineEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={page} totalPages={totalPages}
            onPageChange={(p) => { setPage(p); setSelected(new Set()); }}
            info={`${t("pagination.page_info", { start: page * MANAGE_PAGE_SIZE + 1, end: Math.min((page + 1) * MANAGE_PAGE_SIZE, total) })} / ${t("manage.total", { count: total })}`}
          />
        </div>
      )}

      {/* ── Mobile Card List ──────────────────────────────────── */}
      {!loading && !error && mediaList.length > 0 && (
        <div className="sm:hidden space-y-2.5">
          {mediaList.map((m) => (
            <ManageMobileCard
              key={m.id}
              movie={m}
              isSelected={selected.has(m.id)}
              enrichingIds={enrichingIds}
              onToggle={toggleSelection}
              onConfirmDelete={confirmDelete}
              onSetDetailMovie={setDetailMovie}
              onSetRematchMovie={setRematchMovie}
              onEnrich={handleEnrich}
              onSetMarkWatchedMovie={setMarkWatchedMovie}
              onStartInlineEdit={startInlineEdit}
            />
          ))}
          <Pagination currentPage={page} totalPages={totalPages}
            onPageChange={(p) => { setPage(p); setSelected(new Set()); }}
            info={`${t("pagination.page_info", { start: page * MANAGE_PAGE_SIZE + 1, end: Math.min((page + 1) * MANAGE_PAGE_SIZE, total) })} / ${t("manage.total", { count: total })}`}
          />
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────── */}
      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.type === "single" ? t("manage.delete_confirm_title")
          : deleteConfirm?.type === "selected" ? t("manage.delete_selected_confirm_title")
          : t("manage.delete_all_confirm_title")}
        description={deleteConfirm?.type === "single" ? t("manage.delete_confirm_desc", { title: deleteConfirm?.title ?? "" })
          : deleteConfirm?.type === "selected" ? t("manage.delete_confirm_selected", { count: deleteConfirm?.count ?? 0 })
          : t("manage.delete_confirm_all", { count: deleteConfirm?.count ?? 0 })}
        footer={<div className="flex items-center gap-2 w-full justify-end">
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</button>
          <button className="btn btn-sm gap-1.5" style={{ background: "var(--destructive)", color: "#fff", borderColor: "transparent" }} onClick={executeDelete}>
            <Trash2 size={12} />{deleteConfirm?.type === "single" ? t("common.delete") : t("manage.delete_all_confirm_btn")}
          </button>
        </div>}
      >
        {deleteConfirm?.type === "all" && <p className="text-sm text-muted-foreground">{t("manage.delete_confirm_all2")}</p>}
      </Modal>

      {/* ── TMDB Search & Import Dialog ─────────────────────────── */}
      <SearchImportModal open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)}      onImportComplete={() => { setSearchDialogOpen(false); fetchData(undefined, true); }} />

      {/* ── Metadata Detail Modal ───────────────────────────────── */}
      <DetailModal open={detailMovie !== null} movie={detailMovie} onClose={() => setDetailMovie(null)}
        onSave={() => { fetchData(undefined, true); }} />

      {/* ── Manual Search & Match Modal ─────────────────────────── */}
      <RematchModal open={rematchMovie !== null} movie={rematchMovie} onClose={() => setRematchMovie(null)}      onSuccess={() => { setRematchMovie(null); fetchData(undefined, true); }} />

      {/* ── Mark as Watched Modal ──────────────────────────────── */}
      <MarkWatchedModal open={markWatchedMovie !== null} movie={markWatchedMovie}
        onClose={() => setMarkWatchedMovie(null)}
        onConfirm={async (movieId, rating) => {
          const rounded = Math.round(rating * 10) / 10;
          try {
            await api.markMediaAsWatched(movieId, rounded);
            // Update local state immediately
            setMediaList((prev) => prev.map((m) => m.id === movieId ? { ...m, status: "watched", rating: rounded } : m));
            showToast(t("wishlist.marked_as_watched", { title: mediaList.find(m => m.id === movieId)?.title || "", rating: rounded }), "success");
            setMarkWatchedMovie(null);
            fetchData(undefined, true);
          } catch (err: any) { showToast(t("wishlist.mark_failed", { message: err.message }), "error"); }
        }}
      />

      {/* ── Genre Edit Dialog ──────────────────────────────────── */}
      <GenreEditModal open={genreDialogMovie !== null} movie={genreDialogMovie}
        onClose={() => setGenreDialogMovie(null)}
        onSave={async (movieId, genre) => {
          const movie = mediaList.find(m => m.id === movieId);
          if (!movie) return;
          if (genre === (movie.genre || "")) { setGenreDialogMovie(null); return; }
          try {
            await api.updateMedia(movieId, { title: movie.title, rating: movie.rating, year: movie.year, genre: genre || null } as any);
            // Update local state immediately
            setMediaList((prev) => prev.map((m) => m.id === movieId ? { ...m, genre: genre || null } : m));
            showToast(t("manage.genre_updated"), "success");
            setGenreDialogMovie(null);
            fetchData(undefined, true);
          } catch (err: any) { showToast(t("manage.save_failed", { message: err.message }), "error"); }
        }}
      />
    </FadeContent>
  );
}
const ManageTableRow = memo(function ManageTableRow({ 
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
  const isEditingRating = editingCell?.movieId === movie.id && editingCell?.field === "rating";

  return (
    <tr className={`transition-colors ${isSelected ? "bg-primary/[0.04]" : "hover:bg-accent/20"}`}>
      <td className="px-3 max-sm:px-2 py-2 max-sm:py-3 border-b border-border text-center">
        <input type="checkbox" className="w-4 h-4 max-sm:w-5 max-sm:h-5 accent-primary cursor-pointer"
          checked={isSelected} onChange={() => onToggle(movie.id)} />
      </td>
      <td className="px-1 max-sm:hidden py-2 max-sm:py-3 border-b border-border text-center">
        <div className="relative w-[38px] h-[52px] rounded overflow-hidden bg-muted flex items-center justify-center mx-auto"
          style={{ border: "1px solid var(--border-subtle)" }}>
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : null}
          <Film size={14} className={`text-muted-foreground/30 ${movie.poster_url ? "hidden" : ""}`} />
          {movie.scrape_error && !movie.poster_url && (
            <div className="absolute bottom-0.5 right-0.5 group">
              <AlertCircle size={12} className="text-destructive cursor-help" />
              <div className="absolute bottom-full right-0 mb-1.5 w-56 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] leading-relaxed shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                <span className="font-semibold">{t("manage.scrape_error_label")}</span><br />{movie.scrape_error}
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="px-3 max-sm:px-2 py-2 max-sm:py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          {movie.status === "wish" ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-pink px-1.5 py-0.5 rounded-full bg-pink/10 border border-pink/20">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              {t("manage.status_wish")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-green px-1.5 py-0.5 rounded-full bg-green/10 border border-green/20">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="20 6 9 17 4 12" /></svg>
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
              S{movie.season_number}{movie.episode_count != null && <span className="ml-0.5 opacity-70">· {movie.episode_count}ep</span>}
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
        <span className="text-muted-foreground text-xs">{movie.created_at ? movie.created_at.slice(0, 10) : "—"}</span>
      </TableEditableCell>
      <td className="px-1 max-sm:px-0.5 py-2 max-sm:py-3 border-b border-border text-center whitespace-nowrap">
        <div className="inline-flex items-center gap-0.5 max-sm:gap-1" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--seed-radius)", padding: "1px" }}>
          {movie.status === "wish" && (
            <button className="text-muted-foreground hover:text-green px-1.5 max-sm:px-2 py-1 max-sm:py-1.5 rounded transition-colors hover:bg-green/10"
              onClick={() => onSetMarkWatchedMovie(movie)} title={t("wishlist.mark_as_watched")}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          )}
          <button className="text-muted-foreground hover:text-sky px-1.5 max-sm:px-2 py-1 max-sm:py-1.5 rounded transition-colors hover:bg-sky/10"
            onClick={() => onSetDetailMovie(movie)} title={t("manage.detail")}><InfoIcon size={14} /></button>

          <button className={`px-1.5 max-sm:px-2 py-1 max-sm:py-1.5 rounded transition-colors ${movie.scrape_error ? "text-amber" : "text-muted-foreground"} hover:text-sky hover:bg-sky/10`}
            onClick={() => onSetRematchMovie(movie)} title={movie.scrape_error ? t("manage.rematch_error_hint") : t("manage.rematch")}>
            <Search size={14} />
          </button>
          <button className={`px-1.5 max-sm:px-2 py-1 max-sm:py-1.5 rounded transition-colors ${enrichingIds.has(movie.id) ? "text-primary animate-pulse" : "text-muted-foreground hover:text-amber"} hover:bg-amber/10`}
            onClick={() => onEnrich(movie.id)} disabled={enrichingIds.has(movie.id)}
            title={enrichingIds.has(movie.id) ? t("manage.enriching") : t("manage.enrich")}>
            {enrichingIds.has(movie.id) ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
          <button className="text-muted-foreground hover:text-destructive px-1.5 max-sm:px-2 py-1 max-sm:py-1.5 rounded transition-colors hover:bg-destructive/10"
            onClick={() => onConfirmDelete(movie.id, movie.title)} title={t("common.delete")}><Trash2 size={14} /></button>
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

/* ── Inline info icon (no lucide import needed) ───────────────── */
/* ── Reusable editable table cell component ────────────────────

   Rating slider uses LOCAL state so that onChange (frequent on every drag)
   does not flow back through the parent and re-render all other rows.
   The parent's sliderValue prop is only used to INITIALIZE the local state
   when editing starts for THIS cell. ───────────────────────── */
const TableEditableCell = memo(function TableEditableCell({ movie, field, editingCell, sliderValue, children, onStartEdit, onSaveEdit, onCancelEdit, tdClassName }: {
  movie: MediaDetail;
  field: string;
  editingCell: { movieId: number; field: string } | null;
  sliderValue: number;
  children: React.ReactNode;
  onStartEdit: (movieId: number, field: string) => void;
  onSaveEdit: (movieId: number, field: string, value: string) => Promise<void>;
  onCancelEdit: () => void;
  tdClassName?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingCell?.movieId === movie.id && editingCell?.field === field;

  // Local slider state — initialised from parent when editing starts.
  // useState gives the correct value on first-edit (React batches the
  // parent's setSliderValue + setEditingCell into one render).
  // useEffect syncs on re-edit of the same row (e.g. cancel → re-edit).
  const [localSlider, setLocalSlider] = useState(sliderValue);
  useEffect(() => {
    if (isEditing) setLocalSlider(sliderValue);
  }, [isEditing, sliderValue]);

  const handleSave = useCallback(() => {
    const v = inputRef.current?.value ?? localSlider.toFixed(1);
    onSaveEdit(movie.id, field, v);
  }, [movie.id, field, localSlider, onSaveEdit]);

  const handleRangeSave = useCallback(() => {
    onSaveEdit(movie.id, "rating", localSlider.toFixed(1));
  }, [movie.id, localSlider, onSaveEdit]);

  if (isEditing) {
    if (field === "rating") {
      return (
        <td className={`px-3 py-2 border-b border-border ${tdClassName || ''}`}>
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <input type="range" min={0} max={10} step={0.5} value={localSlider}
              onChange={(e) => { setLocalSlider(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
              onMouseUp={handleRangeSave} onTouchEnd={handleRangeSave}
              onBlur={handleRangeSave}
              className="w-20 h-1 sm:h-1 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer touch-manipulation
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                max-sm:[&::-webkit-slider-thumb]:w-6 max-sm:[&::-webkit-slider-thumb]:h-6
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
                [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out
                active:[&::-webkit-slider-thumb]:scale-125
                max-sm:h-2"
              autoFocus />
            <span className="text-amber font-medium text-xs min-w-[24px] text-center count-badge" key={localSlider}>
              {localSlider.toFixed(1)}
            </span>
          </span>
        </td>
      );
    }
    let value = "", inputType = "text", widthClass = "";
    switch (field) {
      case "title": value = movie.title; widthClass = "w-full min-w-[120px]"; break;
      case "year": inputType = "number"; widthClass = "w-[72px]"; value = movie.year != null ? movie.year.toString() : ""; break;
      case "created_at": inputType = "date"; widthClass = "w-[110px]"; value = movie.created_at ? movie.created_at.slice(0, 10) : ""; break;
    }
    return (
      <td className={`px-3 py-2 border-b border-border ${tdClassName || ''}`}>
        <div className="flex items-center gap-1">
          <input ref={inputRef} type={inputType} className={`no-spinner ${widthClass} input-field h-7 text-sm px-1.5 py-0.5`}
            defaultValue={value}                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } if (e.key === "Escape") { onCancelEdit(); } }}
            onBlur={handleSave}
            onClick={(e) => e.stopPropagation()} autoFocus />
        </div>
      </td>
    );
  }

  return (      <td className={`px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-accent/30 group ${tdClassName || ''}`}
      onClick={() => onStartEdit(movie.id, field)} title={t("common.edit")}>
      <div className="flex items-center gap-1">
        {children}
        <span className="opacity-0 group-hover:opacity-40 max-sm:opacity-30 transition-opacity">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
        </span>
      </div>
    </td>
  );
}, (prev, next) => {
  // Only re-render editing cell when it's this row's cell being edited
  const thisRow = prev.movie.id;
  const prevEditing = prev.editingCell?.movieId === thisRow && prev.editingCell?.field === prev.field;
  const nextEditing = next.editingCell?.movieId === thisRow && next.editingCell?.field === next.field;
  if (prevEditing !== nextEditing) return false;
  if (nextEditing && prev.sliderValue !== next.sliderValue) return false;
  return true;
});

/* ── Mobile Card Row ──────────────────────────────────────────── */
const ManageMobileCard = memo(function ManageMobileCard({ movie, isSelected, enrichingIds, onToggle, onConfirmDelete, onSetDetailMovie, onSetRematchMovie, onEnrich, onSetMarkWatchedMovie, onStartInlineEdit }: {
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
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                    {t("manage.status_wish")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green px-1.5 py-0.5 rounded-full bg-green/10 border border-green/20">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="20 6 9 17 4 12" /></svg>
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
                    S{movie.season_number}{movie.episode_count != null && <span className="ml-0.5 opacity-70">· {movie.episode_count}ep</span>}
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

function InfoIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}
