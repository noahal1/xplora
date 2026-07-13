import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail, MediaSearchResult, SortField } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { useEnrich } from "../../context/EnrichContext";
import { Pagination } from "../Pagination";
import { SkeletonTable } from "../Skeleton";
import CountUp from "../CountUp";
import { Modal } from "../Modal";
import { GenreFilter } from "../GenreFilter";
import { CountryFilter } from "../CountryFilter";
import { MediaTypeFilter } from "../MediaTypeFilter";
import { SortControls } from "../SortControls";
import { StatusFilter } from "../StatusFilter";
import { SearchInput } from "../SearchInput";
import { ScrapeSourceFilter } from "../ScrapeSourceFilter";
import FadeContent from "../FadeContent";
import { Film, Upload, Plus, Sparkles, Loader2, RefreshCw, Trash2, WandSparkles, X } from "lucide-react";
import { useDebouncedSearch } from "../../hooks/useDebouncedSearch";
import { useSort } from "../../hooks/useSort";
import { isAbortError, getErrMsg } from "../../lib/utils";
import { useEnrichReload } from "../../hooks/useEnrichReload";

import { EmptyState } from "../EmptyState";
import { SearchImportModal } from "./SearchImportModal";
import { DetailModal } from "./DetailModal";
import { RematchModal } from "./RematchModal";
import { MarkWatchedModal } from "./MarkWatchedModal";
import { GenreEditModal } from "./GenreEditModal";
import { ManageTableRow } from "./ManageTableRow";
import { ManageMobileCard } from "./ManageMobileCard";
import { TVSeriesManageRow } from "./TVSeriesManageRow";
import { TVSeriesGroupItem } from "../tabs/watched/TVSeriesGroupItem";
import { FilterBar } from "../shared/FilterBar";
import { groupTVSeries } from "../../utils/groupTVSeries";
import type { TVSeriesGroup } from "../../utils/groupTVSeries";

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
  const [genreFilter, setGenreFilter] = useState<Set<string>>(new Set());
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());

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

  // ── Group TV series by tv_series_id ──
  const { standalone: standaloneMedia, groups: tvGroups } = useMemo(
    () => groupTVSeries(mediaList),
    [mediaList]
  );

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
        genre: genreFilter.size > 0 ? Array.from(genreFilter).join(",") : undefined,
        country: countryFilter.size > 0 ? Array.from(countryFilter).join(",") : undefined,
        signal,
      });
      if (signal?.aborted) return;
      setMediaList(data.media);
      setTotal(data.total);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(getErrMsg(err));
    } finally {
      if (!signal?.aborted && !quiet) {
        setLoading(false);
      }
    }
  }, [search.debouncedValue, page, statusFilter, mediaTypeFilter, genreFilter, countryFilter, errorFilter, sortField, sortDir]);



  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Auto-refresh when background enrichment completes
  useEnrichReload(() => { fetchData(); });

  useEffect(() => {
    const allItems = [...standaloneMedia, ...tvGroups.flatMap((g) => g.seasons)];
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && selected.size < allItems.length;
  }, [selected, standaloneMedia, tvGroups]);

  const toggleSelection = useCallback((id: number) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allItems = [...standaloneMedia, ...tvGroups.flatMap((g) => g.seasons)];
    if (allItems.length === 0) return;
    const allSelected = allItems.every((m) => selected.has(m.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allItems.forEach((m) => next.delete(m.id));
      else allItems.forEach((m) => next.add(m.id));
      return next;
    });
  }, [standaloneMedia, tvGroups, selected]);

  const toggleGroup = useCallback((tvSeriesId: string) => {
    const group = tvGroups.find((g) => g.tvSeriesId === tvSeriesId);
    if (!group) return;
    const seasonIds = group.seasons.map((s) => s.id);
    const allSelected = seasonIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) seasonIds.forEach((id) => next.delete(id));
      else seasonIds.forEach((id) => next.add(id));
      return next;
    });
  }, [tvGroups, selected]);

  const removeGroup = useCallback(async (seasonIds: number[]) => {
    try {
      const result = await api.batchDeleteMedia(seasonIds);
      showToast(t("manage.deleted_count", { count: result.count }), "success");
      setSelected((prev) => {
        const next = new Set(prev);
        seasonIds.forEach((id) => next.delete(id));
        return next;
      });
      fetchData(undefined, true);
    } catch (err) {
      showToast(t("manage.delete_failed", { message: getErrMsg(err) }), "error");
    }
  }, [fetchData, showToast, t]);

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
      fetchData(undefined, true);      } catch (err) {
      showToast(t("manage.delete_failed", { message: getErrMsg(err) }), "error");
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
      case "episode_count": newValue = value ? parseInt(value) : null; if (value && (isNaN(newValue) || newValue < 0)) return; updatedFields.episode_count = newValue; break;
      case "created_at": newValue = value || null; updatedFields.created_at = newValue; break;
    }
    const currentVal = movie[field as keyof MediaDetail];
    if (updatedFields[field] === currentVal || (currentVal == null && updatedFields[field] == null)) { cancelInlineEdit(); return; }
    try {
      const updated = await api.updateMedia(movieId, {
        title: updatedFields.title ?? movie.title,
        rating: updatedFields.rating ?? movie.rating,
        year: updatedFields.year !== undefined ? updatedFields.year : movie.year,
        episode_count: updatedFields.episode_count !== undefined ? updatedFields.episode_count : movie.episode_count,
        genre: movie.genre || "",
        created_at: updatedFields.created_at !== undefined ? updatedFields.created_at : movie.created_at,
      } as any);
      // Update local state immediately
      setMediaList(prev => prev.map(m => m.id === movieId ? { ...m, ...updated } : m));
      showToast(t("manage.updated"), "success");
      cancelInlineEdit();
      fetchData(undefined, true);
    } catch (err) { showToast(t("manage.save_failed", { message: getErrMsg(err) }), "error"); cancelInlineEdit(); }
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
    } catch (err) { showToast(t("manage.enrich_failed", { message: getErrMsg(err) }), "error"); }
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
    } catch (err) { showToast(t("manage.batch_all_failed", { message: getErrMsg(err) }), "error"); }
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
        genre: genreFilter.size > 0 ? Array.from(genreFilter).join(",") : undefined,
        country: countryFilter.size > 0 ? Array.from(countryFilter).join(",") : undefined,
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
    } catch (err) {
      showToast(t("manage.export_failed", { message: getErrMsg(err) }), "error");
    }
  }, [total, search.debouncedValue, statusFilter, sortField, sortDir, errorFilter, mediaTypeFilter, genreFilter, showToast, t]);

  /* ── Pagination helpers ──────────────────────────────────────── */
  const totalPages = Math.ceil(total / MANAGE_PAGE_SIZE);

  // ── Fetch all unique countries & genres for filter dropdowns ──
  const [filterCountries, setFilterCountries] = useState<string[]>([]);
  const [filterGenres, setFilterGenres] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getMediaFilters().then((data) => {
      if (!cancelled) {
        setFilterCountries(data.countries);
        setFilterGenres(data.genres);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const hasActiveFilters = !!(search.debouncedValue || statusFilter || mediaTypeFilter || genreFilter.size > 0 || countryFilter.size > 0 || errorFilter);

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
          <span className="badge font-mono text-xs shrink-0">
            {t("manage.total").split("{{count}}")[0]}<CountUp end={total} />{t("manage.total").split("{{count}}")[1]}
          </span>
        </h2>
        <div className="flex gap-1.5 items-center w-full sm:w-auto overflow-x-auto no-scrollbar max-sm:pb-1 max-sm:-mb-1">
          <button className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm shrink-0" onClick={() => fetchData()} title={t("manage.refresh")}>
            <RefreshCw size={13} /><span className="hidden sm:inline">{t("manage.refresh")}</span>
          </button>
          <button className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm shrink-0" onClick={handleExportMovies} title={t("manage.export")}>
            <Upload size={13} /><span className="hidden sm:inline">{t("manage.export")}</span>
          </button>
          <button className={`btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm gap-1 sm:gap-1.5 shrink-0 ${batchLoading ? "opacity-50" : ""}`}
            onClick={handleBatchAll} disabled={batchLoading} title={t("manage.batch_all")}>
            {batchLoading ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}
            <span className="hidden sm:inline">{t("manage.batch_all")}</span>
          </button>
          <button className="btn btn-primary btn-xs sm:py-1.5 sm:px-3 sm:text-sm shrink-0" onClick={openSearchDialog} title={t("manage.add_movie")}>
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

      {/* ── Filters (collapsible on mobile) ──────────────── */}
      <FilterBar
        collapseLabel={t("manage.filter_collapse")}
        expandLabel={t("manage.filter_expand")}
      >
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
            genres={filterGenres}
            selected={genreFilter}
            onSelect={(g) => { setGenreFilter(g); setPage(0); setSelected(new Set()); }}
          />
          {genreFilter.size > 0 && (
            <div className="flex items-center gap-1 mb-2 sm:mb-3">
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => { setGenreFilter(new Set()); setPage(0); setSelected(new Set()); }}
              >
                {t("manage.clear_filter")}
              </button>
            </div>
          )}
          <CountryFilter
            countries={filterCountries}
            selected={countryFilter}
            onSelect={(c) => { setCountryFilter(c); setPage(0); setSelected(new Set()); }}
          />
          {countryFilter.size > 0 && (
            <div className="flex items-center gap-1 mb-2 sm:mb-3">
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => { setCountryFilter(new Set()); setPage(0); setSelected(new Set()); }}
              >
                {t("manage.clear_filter")}
              </button>
            </div>
          )}
        </div>
      </FilterBar>

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
            setGenreFilter(new Set());
            setCountryFilter(new Set());
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
                  <th className="w-10 text-center px-3 py-2.5 font-medium text-xs text-muted-foreground bg-bg-canvas border-b border-border select-none">
                    <input type="checkbox" ref={selectAllRef} className="w-4 h-4 accent-primary cursor-pointer"
                      checked={mediaList.length > 0 && mediaList.every((m) => selected.has(m.id))} onChange={toggleSelectAll} />
                  </th>
                  <th className="w-[52px] px-1 py-2.5 text-center font-medium text-xs text-muted-foreground bg-bg-canvas border-b border-border select-none max-sm:hidden">{t("manage.col_poster")}</th>
                  <th className="w-14 px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-bg-canvas border-b border-border select-none">{t("manage.col_status")}</th>
                  {(["title", "rating", "episode_count", "year", "genre", "created_at"] as const).map((field) => {
                    const widths: Record<string, number | undefined> = { title: 200, rating: 140, episode_count: 72, year: 72, genre: undefined, created_at: 100 };
                    return (
                      <th key={field} className={`px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-bg-canvas border-b border-border select-none cursor-pointer hover:text-foreground transition-colors${field === 'created_at' ? ' max-sm:hidden' : ''}`}
                        style={widths[field] ? { width: widths[field] } : undefined} onClick={() => handleSort(field)}>
                        {field === "title" ? t("manage.col_title") : field === "rating" ? t("manage.col_rating") : field === "year" ? t("manage.col_year") : field === "episode_count" ? t("manage.col_episode_count", "集数") : field === "genre" ? t("manage.col_genre") : t("manage.col_date")}
                        <SortArrow field={field} />
                      </th>
                    );
                  })}
                  <th className="w-[120px] max-sm:w-[160px] text-center px-1 py-2.5 font-medium text-xs text-muted-foreground bg-bg-canvas border-b border-border select-none">{t("manage.col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {standaloneMedia.map((m) => (
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
                {tvGroups.map((g) => (
                  <TVSeriesManageRow
                    key={g.tvSeriesId}
                    group={g}
                    isSelected={g.seasons.every((s) => selected.has(s.id))}
                    editingCell={editingCell}
                    sliderValue={sliderValue}
                    selected={selected}
                    enrichingIds={enrichingIds}
                    onToggleGroup={toggleGroup}
                    onToggle={toggleSelection}
                    onOpenDetail={setDetailMovie}
                    onSetRematchMovie={setRematchMovie}
                    onEnrich={handleEnrich}
                    onRemoveGroup={removeGroup}
                    onConfirmDelete={confirmDelete}
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
          {standaloneMedia.map((m) => (
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
          {tvGroups.map((g) => (
            <TVSeriesGroupItem
              key={g.tvSeriesId}
              group={g}
              isSelected={g.seasons.every((s) => selected.has(s.id))}
              onToggleGroup={toggleGroup}
              onRemoveSeason={(id) => {
                const movie = mediaList.find((m) => m.id === id);
                if (movie) confirmDelete(id, movie.title);
              }}
              onRemoveGroup={removeGroup}
              onOpenDetail={setDetailMovie}
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
          } catch (err) { showToast(t("wishlist.mark_failed", { message: getErrMsg(err) }), "error"); }
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
          } catch (err) { showToast(t("manage.save_failed", { message: getErrMsg(err) }), "error"); }
        }}
      />
    </FadeContent>
  );
}

