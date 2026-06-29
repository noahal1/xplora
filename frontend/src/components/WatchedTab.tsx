import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaImport, MediaDetail } from "../types";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { useEnrich } from "../context/EnrichContext";
import { Pagination } from "./Pagination";
import { DetailModal } from "./ManageTab/DetailModal";
import { List, LayoutGrid } from "lucide-react";
import CountUp from "./CountUp";
import { useDebouncedSearch } from "../hooks/useDebouncedSearch";
import { useGenreExtractor } from "../hooks/useGenreExtractor";
import { isAbortError, getErrMsg } from "../lib/utils";
import { useEnrichReload } from "../hooks/useEnrichReload";
import { usePagination } from "../hooks/usePagination";
import { useSort } from "../hooks/useSort";
import { groupTVSeries } from "../utils/groupTVSeries";
import type { TVSeriesGroup } from "../utils/groupTVSeries";
import FadeContent from "./FadeContent";
import { EmptyState } from "./EmptyState";
import { GenreFilter } from "./GenreFilter";
import { MediaTypeFilter } from "./MediaTypeFilter";
import { SortControls } from "./SortControls";
import { SearchInput } from "./SearchInput";
import { FilterBar } from "./shared/FilterBar";
import { MovieGridCard } from "./tabs/watched/MovieGridCard";
import { MovieListItem } from "./tabs/watched/MovieListItem";
import { WatchedMobileCard } from "./tabs/watched/WatchedMobileCard";
import { TVSeriesGroupItem } from "./tabs/watched/TVSeriesGroupItem";
import { TVSeriesGroupCard } from "./tabs/watched/TVSeriesGroupCard";
import { ImportModal } from "./tabs/watched/ImportModal";
import { SearchModal } from "./tabs/watched/SearchModal";
import { BatchRatingModal } from "./tabs/watched/BatchRatingModal";

const PAGE_SIZE = 16;

export function WatchedTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [media, setMedia] = useState<MediaDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");

  const search = useDebouncedSearch("", 300);
  const { field: sortField, dir: sortDir, toggle: handleSortToggle } = useSort("created_at", "desc");
  const { page: currentPage, setPage: setCurrentPage, totalPages } = usePagination(total, PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [detailMovie, setDetailMovie] = useState<MediaDetail | null>(null);

  // ── Group TV series by tv_series_id ──
  const { standalone: standaloneMedia, groups: tvGroups } = useMemo(
    () => groupTVSeries(media),
    [media]
  );

  // Rating editing is localised inside MovieGridCard / MovieListItem to avoid
  // re-rendering all 30 rows on every slider drag (sliderValue changes on each onChange).
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [batchRatingOpen, setBatchRatingOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(
    () => (localStorage.getItem("xplora-watched-view") as "list" | "grid") || "list"
  );

  // ── Load data from API ──

  const loadMovies = useCallback(async (page: number, q: string, sortF: string, sortD: string, rating: string, mediaType: string, genre: string, signal?: AbortSignal) => {
    setLoading(true);
    let ratingMin: number | undefined;
    let ratingMax: number | undefined;
    if (rating && rating !== "all") {
      const [min, max] = rating.split("-").map(Number);
      ratingMin = min;
      ratingMax = max;
    }
    try {
      const data = await api.listMedia({
        page,
        page_size: PAGE_SIZE,
        status: "watched",
        search: q || undefined,
        sort_field: sortF,
        sort_dir: sortD,
        rating_min: ratingMin,
        rating_max: ratingMax,
        media_type: (mediaType !== "all" ? mediaType : undefined),
        genre: (genre !== "all" ? genre : undefined),
        signal,
      });
      if (signal?.aborted) return;
      setMedia(data.media);
      setTotal(data.total);
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadMovies(currentPage, search.debouncedValue, sortField, sortDir, ratingFilter, mediaTypeFilter, genreFilter, controller.signal);
    return () => controller.abort();
  }, [currentPage, search.debouncedValue, sortField, sortDir, ratingFilter, mediaTypeFilter, genreFilter, reloadTrigger, loadMovies]);

  // Auto-refresh when background enrichment completes
  useEnrichReload(() => setReloadTrigger((n) => n + 1));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.size > 0 && !media.every((m) => selectedIds.has(m.id));
    }
  }, [selectedIds, media]);

  // ── Import helpers ──

  const saveAndReload = useCallback(
    async (raw: MediaImport[], toastMsg: string): Promise<boolean> => {
      try {
        await api.replaceMedia(raw);
        showToast(toastMsg, "success");
        // Start polling for background metadata enrichment
        startPolling();
        setCurrentPage(0);
        search.clear();
        setRatingFilter("all");
        setSelectedIds(new Set());
        setReloadTrigger((n) => n + 1);
        return true;
      } catch (err) {
        showToast(t("watched_import.save_failed", { message: getErrMsg(err) }), "error");
        return false;
      }
    },
    [showToast, startPolling, t]
  );

  const loadSampleData = useCallback(() => {
    const sample: MediaImport[] = [
      { title: "The Shawshank Redemption", rating: 9.3, year: 1994, genre: "Drama" },
      { title: "The Dark Knight", rating: 9.0, year: 2008, genre: "Action / Crime" },
      { title: "Inception", rating: 8.8, year: 2010, genre: "Sci-Fi / Action" },
      { title: "Interstellar", rating: 8.7, year: 2014, genre: "Sci-Fi / Adventure" },
      { title: "Pulp Fiction", rating: 8.9, year: 1994, genre: "Crime / Drama" },
      { title: "Fight Club", rating: 8.8, year: 1999, genre: "Drama / Thriller" },
      { title: "The Matrix", rating: 8.7, year: 1999, genre: "Sci-Fi / Action" },
      { title: "Parasite", rating: 8.5, year: 2019, genre: "Drama / Thriller" },
    ];
    saveAndReload(sample, t("watched_import.sample_data_loaded"));
  }, [saveAndReload, t]);

  // ── Mutations ──

  const reloadCurrentPage = useCallback(() => {
    setReloadTrigger((n) => n + 1);
  }, []);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allMedia = [...standaloneMedia, ...tvGroups.flatMap((g) => g.seasons)];
    const allSelected = allMedia.every((m) => selectedIds.has(m.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) allMedia.forEach((m) => next.delete(m.id));
      else allMedia.forEach((m) => next.add(m.id));
      return next;
    });
  }, [standaloneMedia, tvGroups, selectedIds]);

  const toggleGroup = useCallback((tvSeriesId: string) => {
    const group = tvGroups.find((g) => g.tvSeriesId === tvSeriesId);
    if (!group) return;
    const seasonIds = group.seasons.map((s) => s.id);
    const allSelected = seasonIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) seasonIds.forEach((id) => next.delete(id));
      else seasonIds.forEach((id) => next.add(id));
      return next;
    });
  }, [tvGroups, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const openBatchRating = useCallback(() => {
    if (selectedIds.size === 0) return;
    setBatchRatingOpen(true);
  }, [selectedIds]);

  const confirmBatchRating = useCallback(async (rating: number) => {
    const rounded = Math.round(rating * 10) / 10;
    const targets = media.filter((m) => selectedIds.has(m.id));
    // Update local state immediately
    setMedia((prev) => prev.map((m) => selectedIds.has(m.id) ? { ...m, rating: rounded } : m));
    const results = await Promise.allSettled(
      targets.map((movie) =>
        api.updateMedia(movie.id, {
          title: movie.title,
          rating: rounded,
          year: movie.year,
          genre: movie.genre,
        })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      showToast(t("watched.update_count", { count: succeeded }), "success");
    }
    if (failed > 0) {
      showToast(t("watched.batch_update_failed", { count: failed }), "error");
    }
    setBatchRatingOpen(false);
    setSelectedIds(new Set());
  }, [selectedIds, media, showToast, t]);

  const removeMovie = useCallback(
    async (id: number) => {
      try {
        await api.deleteMedia(id);
        // If we just deleted the last item on a non-first page, go back
        const willBeEmpty = media.length <= 1;
        if (willBeEmpty && currentPage > 0) {
          setCurrentPage((p) => p - 1);
        } else {
          reloadCurrentPage();
        }
      } catch (err) {
        showToast(t("watched.delete_failed", { message: getErrMsg(err) }), "error");
      }
    },
    [media.length, currentPage, reloadCurrentPage, showToast, t]
  );

  const removeGroup = useCallback(
    async (seasonIds: number[]) => {
      try {
        await api.batchDeleteMedia(seasonIds);
        showToast(t("watched.deleted_count", { count: seasonIds.length }), "success");
        setSelectedIds((prev) => {
          const next = new Set(prev);
          seasonIds.forEach((id) => next.delete(id));
          return next;
        });
        reloadCurrentPage();
      } catch (err) {
        showToast(t("watched.delete_failed", { message: getErrMsg(err) }), "error");
      }
    },
    [reloadCurrentPage, showToast, t]
  );

  const handleSaveRating = useCallback(
    async (id: number, rating: number) => {
      const val = Math.round(Math.max(0, Math.min(10, rating)) * 10) / 10;
      setMedia((prev) => prev.map((m) => m.id === id ? { ...m, rating: val } : m));
      try {
        const movie = mediaRef.current.find((m) => m.id === id);
        if (!movie) return;
        await api.updateMedia(id, {
          title: movie.title,
          rating: val,
          year: movie.year,
          genre: movie.genre,
        });
      } catch (err) {
        showToast(t("watched.save_rating_failed", { message: getErrMsg(err) }), "error");
      }
    },
    [showToast, t]
  );

  const uniqueGenres = useGenreExtractor(media);

  // Reset page when search query changes
  useEffect(() => {
    setCurrentPage(0);
  }, [search.debouncedValue, ratingFilter, mediaTypeFilter, genreFilter]);

  useEffect(() => {
    localStorage.setItem("xplora-watched-view", viewMode);
  }, [viewMode]);

  // ── Render ──

  const hasActiveFilters = !!(search.debouncedValue || ratingFilter !== "all" || mediaTypeFilter !== "all" || genreFilter !== "all");

  return (
    <div className="space-y-5">

      {/* === Movie List Section === */}
      {(total > 0 || hasActiveFilters || loading) && (
        <FadeContent className="section-card animate-slide-down">
          <div className="section-header flex-wrap gap-2 sm:flex-nowrap">
            <h2 className="section-title flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
              </svg>
              {t("watched.title")}
            </h2>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-sm:pb-1 max-sm:-mb-1">
              <div className="inline-flex items-center shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] p-0.5">
                <button
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                    viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setViewMode("list")}
                  aria-label={t("watched.view_list")}
                  title={t("watched.view_list")}
                >
                  <List size={15} />
                </button>
                <button
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                    viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setViewMode("grid")}
                  aria-label={t("watched.view_grid")}
                  title={t("watched.view_grid")}
                >
                  <LayoutGrid size={15} />
                </button>
              </div>
              <span className="badge font-mono text-xs shrink-0">
                {t("watched.movie_count", { count: 0 }).replace("0", "")}<CountUp end={total} />
              </span>
            </div>
          </div>

          {/* Search + Import */}
          <div className="flex items-center gap-2 mb-3">
            <SearchInput
              value={search.input}
              onChange={search.setInput}
              onClear={search.clear}
              placeholder={t("watched.search_placeholder")}
              showClear={!!search.debouncedValue}
            />
            <button
              onClick={() => setImportModalOpen(true)}
              className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm shrink-0"
              title={t("watched.import_title")}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="hidden sm:inline">{t("watched.import_title")}</span>
            </button>
            <button
              onClick={() => setSearchModalOpen(true)}
              className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm shrink-0"
              title={t("watched.search_title")}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <span className="hidden sm:inline">{t("watched.search_title")}</span>
            </button>
          </div>

          <FilterBar
            collapseLabel={t("manage.filter_collapse")}
            expandLabel={t("manage.filter_expand")}
          >
            <div className="flex flex-col gap-0 sm:gap-0">
              {/* Row 1: Sort + Rating + MediaType (compact) */}
              <div className="flex items-start sm:items-center gap-2 sm:gap-1 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar">
                <SortControls
                  field={sortField}
                  dir={sortDir}
                  onSort={handleSortToggle}
                />
                <div className="flex items-center gap-1 mb-2 sm:mb-3 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar pb-0.5 shrink-0">
                  {[
                    { value: "all", label: t("watched.filter_all") },
                    { value: "8-10", label: t("watched.filter_8_10") },
                    { value: "6-8", label: t("watched.filter_6_8") },
                    { value: "4-6", label: t("watched.filter_4_6") },
                    { value: "0-4", label: t("watched.filter_0_4") },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`pill ${ratingFilter === opt.value ? "active" : ""}`}
                      onClick={() => {
                        setRatingFilter(opt.value);
                        setCurrentPage(0);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center shrink-0">
                  <MediaTypeFilter
                    selected={mediaTypeFilter}
                    onSelect={(v) => { setMediaTypeFilter(v); setCurrentPage(0); }}
                  />
                </div>
              </div>

              <GenreFilter
                genres={uniqueGenres}
                selected={genreFilter}
                onSelect={(g) => { setGenreFilter(g); setCurrentPage(0); }}
              />
            </div>
          </FilterBar>

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          ) : (
            <>
              {/* Batch Toolbar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-accent rounded-lg animate-slide-down">
                  <span className="text-sm font-medium text-accent-foreground shrink-0">
                    {t("watched.selected_count", { count: selectedIds.size })}
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    <button className="btn btn-ghost btn-xs" onClick={openBatchRating} title={t("watched.batch_edit_rating")}>
                      <span className="hidden sm:inline">{t("watched.batch_edit_rating")}</span>
                      <span className="sm:hidden">{t("watched.batch_edit_rating")}</span>
                    </button>
                    <button className="btn-subtle btn-xs" onClick={clearSelection} title={t("watched.clear_selection")}>
                      <span className="hidden sm:inline">{t("watched.clear_selection")}</span>
                      <span className="sm:hidden">{t("watched.clear")}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Select all */}
              {media.length > 0 && (
                <label className="flex items-center gap-2 mb-2 px-1 w-fit cursor-pointer select-none">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    className="w-4 h-4 accent-primary cursor-pointer"
                    checked={media.length > 0 && media.every((m) => selectedIds.has(m.id))}
                    onChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">{t("watched.select_all")}</span>
                </label>
              )}

              {/* Movie List / Grid */}
              {standaloneMedia.length === 0 && tvGroups.length === 0 ? (
                <EmptyState
                  hasActiveFilters
                  searchQuery={search.debouncedValue}
                  onClearFilters={() => {
                    search.clear();
                    setRatingFilter("all");
                    setMediaTypeFilter("all");
                    setGenreFilter("all");
                    setCurrentPage(0);
                  }}
                  noMatchKey="watched.no_match"
                  noDataKey="watched.no_movies"
                />
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                  {standaloneMedia.map((m) => (
                    <MovieGridCard
                      key={m.id}
                      movie={m}
                      isSelected={selectedIds.has(m.id)}
                      onToggle={toggleSelection}
                      onRemove={removeMovie}
                      onSaveRating={handleSaveRating}
                      onOpenDetail={setDetailMovie}
                    />
                  ))}
                  {tvGroups.map((g) => (
                    <TVSeriesGroupCard
                      key={g.tvSeriesId}
                      group={g}
                      isSelected={g.seasons.every((s) => selectedIds.has(s.id))}
                      onToggleGroup={toggleGroup}
                      onOpenDetail={setDetailMovie}
                    />
                  ))}
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2.5">
                    {standaloneMedia.map((m) => (
                      <WatchedMobileCard
                        key={m.id}
                        movie={m}
                        isSelected={selectedIds.has(m.id)}
                        onToggle={toggleSelection}
                        onRemove={removeMovie}
                        onSaveRating={handleSaveRating}
                        onOpenDetail={setDetailMovie}
                      />
                    ))}
                    {tvGroups.map((g) => (
                      <TVSeriesGroupItem
                        key={g.tvSeriesId}
                        group={g}
                        isSelected={g.seasons.every((s) => selectedIds.has(s.id))}
                        onToggleGroup={toggleGroup}
                        onRemoveSeason={removeMovie}
                        onRemoveGroup={removeGroup}
                        onOpenDetail={setDetailMovie}
                      />
                    ))}
                  </div>
                  {/* Desktop list */}
                  <div className="max-sm:hidden space-y-1.5">
                    {standaloneMedia.map((m) => (
                      <MovieListItem
                        key={m.id}
                        movie={m}
                        isSelected={selectedIds.has(m.id)}
                        onToggle={toggleSelection}
                        onRemove={removeMovie}
                        onSaveRating={handleSaveRating}
                        onOpenDetail={setDetailMovie}
                      />
                    ))}
                    {tvGroups.map((g) => (
                      <TVSeriesGroupItem
                        key={g.tvSeriesId}
                        group={g}
                        isSelected={g.seasons.every((s) => selectedIds.has(s.id))}
                        onToggleGroup={toggleGroup}
                        onRemoveSeason={removeMovie}
                        onRemoveGroup={removeGroup}
                        onOpenDetail={setDetailMovie}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Pagination */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                info={t("watched.total_movies", { count: total })}
              />
            </>
          )}
        </FadeContent>
      )}

      {/* === Empty State (no movies at all, no filters) === */}
      {total === 0 && !hasActiveFilters && !loading && (
        <FadeContent className="section-card">
          <EmptyState
            icon={
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
              </svg>
            }
            noDataKey="watched.no_movies"
            noDataSubtextKey="watched.no_movies_hint"
            noDataActions={
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setImportModalOpen(true)}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {t("watched.import_title")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSearchModalOpen(true)}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  {t("watched.search_title")}
                </button>
              </div>
            }
          />
        </FadeContent>
      )}

      {/* === Import Modal === */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={async (raw) => saveAndReload(raw, t("watched_import.data_parsed", { count: raw.length }))}
        onLoadSample={loadSampleData}
        t={t}
      />

      {/* === Search Modal === */}
      <SearchModal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onAddSuccess={() => setReloadTrigger((n) => n + 1)}
        t={t}
      />

      {/* === Batch Rating Modal === */}
      <BatchRatingModal
        open={batchRatingOpen}
        onClose={() => setBatchRatingOpen(false)}
        selectedCount={selectedIds.size}
        onConfirm={confirmBatchRating}
        t={t}
      />

      {/* === Saved Item Detail Modal === */}
      <DetailModal
        open={detailMovie !== null}
        movie={detailMovie}
        onClose={() => setDetailMovie(null)}
      />
    </div>
  );
}
