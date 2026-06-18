import { useState, useRef, useCallback, useEffect, memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaImport, MediaDetail, MediaSearchResult, SortField } from "../types";
import { parseCSV, parseMovieData } from "../utils/csv";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { useEnrich } from "../context/EnrichContext";
import { Separator } from "./ui/separator";
import { Modal } from "./Modal";
import { Pagination } from "./Pagination";
import { ProgressiveImage } from "./ProgressiveImage";
import { DetailModal } from "./ManageTab/DetailModal";
import { Upload, List, LayoutGrid, Loader2, Film, ChevronRight } from "lucide-react";
import { Badge } from "./ui/badge";
import { translateGenres } from "../utils/genre";
import { useDebouncedSearch } from "../hooks/useDebouncedSearch";
import { useGenreExtractor } from "../hooks/useGenreExtractor";
import { usePagination } from "../hooks/usePagination";
import { useSort } from "../hooks/useSort";
import { GenreFilter } from "./GenreFilter";

const SLIDER_BASE_CLASS = "h-1 sm:h-1 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer touch-manipulation [&::-webkit-slider-thumb]:appearance-none max-sm:[&::-webkit-slider-thumb]:w-6 max-sm:[&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out active:[&::-webkit-slider-thumb]:scale-125 max-sm:h-2";
const SLIDER_RANGE_CLASS = `${SLIDER_BASE_CLASS} w-14 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3`;
const SLIDER_RANGE_CLASS_LIST = `${SLIDER_BASE_CLASS} w-20 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5`;

const PAGE_SIZE = 30;

export function WatchedTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [media, setMedia] = useState<MediaDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");

  const search = useDebouncedSearch("", 300);
  const { field: sortField, dir: sortDir, toggle: handleSortToggle } = useSort("created_at", "desc");
  const { page: currentPage, setPage: setCurrentPage, totalPages } = usePagination(total, 30);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [detailMovie, setDetailMovie] = useState<MediaDetail | null>(null);
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [jsonText, setJsonText] = useState("");

  // Rating editing is localised inside MovieGridCard / MovieListItem to avoid
  // re-rendering all 30 rows on every slider drag (sliderValue changes on each onChange).
  // === External search (TMDB / TVmaze) ===
  const [externalQuery, setExternalQuery] = useState("");
  const [searchSource, setSearchSource] = useState("auto");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchDone, setSearchDone] = useState(false);
  const [addingSearchIds, setAddingSearchIds] = useState<Set<string>>(new Set());
  const searchSourceRef = useRef(searchSource);
  searchSourceRef.current = searchSource;
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [batchRatingOpen, setBatchRatingOpen] = useState(false);
  const [batchRatingValue, setBatchRatingValue] = useState(7);
  const dragCounterRef = useRef(0);
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
        page_size: 30,
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
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
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
  useEffect(() => {
    const handler = () => {
      setReloadTrigger((n) => n + 1);
    };
    window.addEventListener("enrich-done", handler);
    return () => window.removeEventListener("enrich-done", handler);
  }, []);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.size > 0 && !media.every((m) => selectedIds.has(m.id));
    }
  }, [selectedIds, media]);

  // ── External search handlers ──

  const handleSearch = useCallback(async () => {
    const q = externalQuery;
    if (!q.trim()) { setSearchResults([]); setSearchError(""); setSearchDone(false); return; }
    setSearchLoading(true);
    setSearchError("");
    try {
      const data = await api.searchMedia(q.trim(), searchSourceRef.current);
      setSearchResults(data.results);
      setSearchDone(true);
    } catch (err: any) {
      setSearchError(err.message);
      setSearchResults([]);
      setSearchDone(true);
    } finally {
      setSearchLoading(false);
    }
  }, [externalQuery]);

  const changeSearchSource = useCallback((source: string) => {
    setSearchSource(source);
  }, []);

  const addSearchResultToWatched = useCallback(async (result: MediaSearchResult) => {
    const key = `${result.source}:${result.source_id}`;
    if (addingSearchIds.has(key)) return;
    setAddingSearchIds((prev) => new Set(prev).add(key));
    try {
      await api.addWatchedMedia({ title: result.title, year: result.year, genre: result.genre || null });
      showToast(t("watched.added", { title: result.title }), "success");
      startPolling();
      setReloadTrigger((n) => n + 1);
    } catch (err: any) {
      showToast(t("watched.add_failed", { message: err.message }), "error");
    } finally {
      setAddingSearchIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [addingSearchIds, showToast, startPolling, t]);

  useEffect(() => {
    localStorage.setItem("xplora-watched-view", viewMode);
  }, [viewMode]);

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
      } catch (err: any) {
        showToast(t("watched_import.save_failed", { message: err.message }), "error");
        return false;
      }
    },
    [showToast, startPolling, t]
  );

  const importMovies = useCallback(
    async (raw: MediaImport[]) => {
      const ok = await saveAndReload(raw, t("watched_import.data_parsed", { count: raw.length }));
      if (ok) {
        setImportSuccess(true);
        await new Promise((r) => setTimeout(r, 1000));
        setImportSuccess(false);
        setImportModalOpen(false);
      }
    },
    [saveAndReload, t]
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
    setShowSampleModal(false);
  }, [saveAndReload, t]);

  const handleFile = useCallback(
    (file: File) => {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".json") && !name.endsWith(".csv")) {
        showToast(t("watched_import.upload_json_or_csv"), "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          let movies: MediaImport[];
          if (name.endsWith(".json")) {
            const data = JSON.parse(text);
            movies = parseMovieData(data);
          } else {
            movies = parseCSV(text);
          }
          importMovies(movies);
        } catch (err: any) {
          showToast(t("watched_import.parse_failed", { message: err.message }), "error");
        }
      };
      reader.onerror = () => showToast(t("watched_import.read_failed"), "error");
      reader.readAsText(file);
    },
    [importMovies, showToast, t]
  );

  const handleManualParse = useCallback(() => {
    if (!jsonText.trim()) {
      showToast(t("watched_import.paste_json"), "error");
      return;
    }
    try {
      const data = JSON.parse(jsonText);
      const movies = parseMovieData(data);
      importMovies(movies);
    } catch (err: any) {
      showToast(t("watched_import.json_parse_failed", { message: err.message }), "error");
    }
  }, [jsonText, importMovies, showToast, t]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFile(files[0]);
    },
    [handleFile]
  );

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
    const allSelected = media.every((m) => selectedIds.has(m.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) media.forEach((m) => next.delete(m.id));
      else media.forEach((m) => next.add(m.id));
      return next;
    });
  }, [media, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const openBatchRating = useCallback(() => {
    if (selectedIds.size === 0) return;
    setBatchRatingValue(7);
    setBatchRatingOpen(true);
  }, [selectedIds]);

  const confirmBatchRating = useCallback(async () => {
    const rounded = Math.round(batchRatingValue * 10) / 10;
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
  }, [batchRatingValue, selectedIds, media, showToast, t]);

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
      } catch (err: any) {
        showToast(t("watched.delete_failed", { message: err.message }), "error");
      }
    },
    [media.length, currentPage, reloadCurrentPage, showToast, t]
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
      } catch (err: any) {
        showToast(t("watched.save_rating_failed", { message: err.message }), "error");
      }
    },
    [showToast, t]
  );

  const uniqueGenres = useGenreExtractor(media);

  // Reset page when search query changes
  useEffect(() => {
    setCurrentPage(0);
  }, [search.debouncedValue, ratingFilter, mediaTypeFilter, genreFilter]);

  // ── Render ──

  return (
    <div className="space-y-5">


      {/* === Movie List Section === */}
      {total > 0 && (
        <section className="section-card animate-slide-down">
          <div className="section-header flex-wrap gap-2 sm:flex-nowrap">
            <h2 className="section-title flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
              </svg>
              {t("watched.title")}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] p-0.5">
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
              <span className="badge font-mono text-xs">
                {t("watched.movie_count", { count: total })}
              </span>
            </div>
          </div>

          {/* Search + Import */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={t("watched.search_placeholder")}
                value={search.input}
                onChange={(e) => search.setInput(e.target.value)}
                className="input-field pl-3 pr-8 py-2 h-auto text-sm"
              />
              {search.debouncedValue && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={search.clear}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setImportModalOpen(true)}
              className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm shrink-0"
              title={t("watched.import_title")}
            >
              <Upload size={14} />
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

          {/* Sort Controls */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap pb-0.5">
            <span className="text-[11px] text-muted-foreground mr-0.5">{t("manage.sort")}</span>
            {[
              { field: "created_at" as SortField, label: t("manage.sort_import_time") },
              { field: "title" as SortField, label: t("manage.sort_title") },
              { field: "rating" as SortField, label: t("manage.sort_rating") },
              { field: "year" as SortField, label: t("manage.sort_year") },
            ].map((opt) => (
              <button
                key={opt.field}
                className={`pill ${sortField === opt.field ? "active" : ""}`}
                onClick={() => handleSortToggle(opt.field)}
              >
                {opt.label}{" "}
                {sortField === opt.field && (
                  <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </div>

          {/* Rating Filters */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap pb-0.5">
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

          {/* Media Type Filter */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap pb-0.5">
            <span className="text-[11px] text-muted-foreground mr-0.5">{t("manage.media_type")}</span>
            {[
              { value: "all", label: t("manage.media_type_all") },
              { value: "movie", label: t("manage.media_type_movie") },
              { value: "tv", label: t("manage.media_type_tv") },
            ].map((opt) => (
              <button
                key={opt.value}
                className={`pill ${mediaTypeFilter === opt.value ? "active" : ""}`}
                onClick={() => {
                  setMediaTypeFilter(opt.value);
                  setCurrentPage(0);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Genre Filter */}
          <GenreFilter
            genres={uniqueGenres}
            selected={genreFilter}
            onSelect={(g) => { setGenreFilter(g); setCurrentPage(0); }}
          />

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
              {media.length === 0 && (search.debouncedValue || ratingFilter !== "all" || mediaTypeFilter !== "all" || genreFilter !== "all") ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t("watched.no_match")}
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                  {media.map((m) => (
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
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2.5">
                    {media.map((m) => (
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
                  </div>
                  {/* Desktop list */}
                  <div className="max-sm:hidden space-y-1.5">
                    {media.map((m) => (
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
        </section>
      )}

      {/* === Empty State === */}
      {total === 0 && !loading && (
        <section className="section-card">
          <div className="empty-state">
            <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
            </svg>
            {search.debouncedValue || ratingFilter !== "all" ? (
              <>
                <p className="text-sm font-medium">{t("watched.no_match")}</p>
                <button
                  className="btn btn-ghost btn-sm mt-3"
                  onClick={() => {
                    search.clear();
                    setRatingFilter("all");
                    setMediaTypeFilter("all");
                    setGenreFilter("all");
                    setCurrentPage(0);
                  }}
                >
                  {t("watched.clear_filters")}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{t("watched.no_movies")}</p>
                <p className="text-xs mt-1">{t("watched.no_movies_hint")}</p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setImportModalOpen(true)}
                  >
                    <Upload size={14} />
                    {t("watched.import_title")}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSearchModalOpen(true)}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    {t("watched.search_title")}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* === Import Modal === */}
      <Modal
        open={importModalOpen}
        onClose={() => {
          if (!importSuccess) setImportModalOpen(false);
        }}
        title={importSuccess ? undefined : t("watched.import_title")}
      >
        {importSuccess ? (
          <div className="flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-green-500">{t("watched_import.success")}</p>
          </div>
        ) : (
        <div className="space-y-4">
          {/* Upload Drop Zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl transition-all ${
              isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/30"
            }`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div
              className="py-8 px-4 text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={`text-2xl mb-2 transition-transform ${isDragOver ? "scale-110" : ""}`}><Upload size={28} /></div>
              <p className={`text-sm font-medium ${isDragOver ? "text-primary" : ""}`}>{t("watched.drag_hint")}</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{t("watched.import_json_or_csv")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFile(file);
                    e.target.value = "";
                  }
                }}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                {t("watched.select_file")}
              </button>
              <button
                className="btn btn-ghost btn-sm ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSampleModal(true);
                }}
                title={t("watched.sample_format")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                {t("watched.sample_format")}
              </button>
            </div>

            {isDragOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 rounded-xl z-10 animate-overlay-fade">
                <div className="text-4xl"><Upload size={36} /></div>
                <div className="text-sm font-semibold text-primary">{t("watched.drop_release")}</div>
                <span className="badge text-[10px]">JSON / CSV</span>
              </div>
            )}
          </div>

          {/* Manual Input */}
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">{t("watched.or_manual_input")}</span>
            </div>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='[\n  {"title": "The Shawshank Redemption", "rating": 9.3, "year": 1994, "genre": "Drama"},\n  {"title": "The Dark Knight", "rating": 9.0, "year": 2008, "genre": "Action / Crime"}\n]'
            rows={4}
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground font-mono text-xs leading-relaxed resize-y min-h-[80px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground"
          />
          <button
            className="btn btn-ghost btn-sm w-full"
            onClick={handleManualParse}
          >
            {t("watched.parse_data")}
          </button>
        </div>
        )}
      </Modal>

      {/* === Search Modal === */}
      <Modal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        title={t("watched.search_title")}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)" }}>
              {[{ value: "auto", label: t("search_source.auto") }, { value: "tmdb", label: t("search_source.tmdb") }, { value: "tvmaze", label: t("search_source.tvmaze") }].map((opt) => (
                <button key={opt.value} className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${searchSource === opt.value ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => changeSearchSource(opt.value)}>{opt.label}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input type="text" placeholder={t("watched.search_placeholder_external")}
                value={externalQuery} onChange={(e) => setExternalQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                className="input-field w-full h-10 text-sm pl-3 pr-10" />
              {externalQuery && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  onClick={() => { setExternalQuery(""); setSearchResults([]); setSearchDone(false); setSearchError(""); }}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              )}
            </div>
            <button className="btn btn-primary btn-sm shrink-0 gap-1.5" onClick={handleSearch} disabled={searchLoading || !externalQuery.trim()}>
              {searchLoading ? (
                <><Loader2 size={13} className="animate-spin" />{t("manage.searching")}</>
              ) : (
                <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>{t("common.search")}</>
              )}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1">{t("wishlist.search_results")}</p>
              {searchResults.map((r, i) => {
                const key = `${r.source}:${r.source_id}`;
                const isAdding = addingSearchIds.has(key);
                return (
                  <div key={`${key}-${i}`} className="card card-lift p-3 flex items-center gap-3 text-sm">
                    <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
                      {r.poster_url ? <ProgressiveImage src={r.poster_url} alt={r.title} className="w-full h-full object-cover" /> : <Film size={16} className="opacity-40" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{r.title}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {r.year && <span className="text-xs text-muted-foreground">{r.year}</span>}
                        {r.genre && <Badge variant="outline" className="text-[10px]">{translateGenres(r.genre)}</Badge>}
                        {r.media_type === "tv" && <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5">TV</Badge>}
                        <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary/70">{r.source.toUpperCase()}</Badge>
                      </div>
                    </div>
                    <button className="btn btn-primary btn-xs shrink-0 gap-1 transition-all" disabled={isAdding}
                      onClick={(e) => { e.stopPropagation(); addSearchResultToWatched(r); }}>
                      {isAdding ? (
                        <><Loader2 size={12} className="animate-spin" />{t("wishlist.adding")}</>
                      ) : (
                        <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>{t("watched.add_to_list")}</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {searchDone && searchResults.length === 0 && externalQuery.trim() && !searchLoading && !searchError && (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">{t("wishlist.search_empty", { query: externalQuery })}</p>
              <p className="text-xs mt-1">{t("wishlist.search_empty_hint")}</p>
            </div>
          )}
          {searchError && <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{searchError}</div>}

          {!externalQuery && !searchLoading && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
              <svg className="w-8 h-8 mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <p className="text-sm">{t("watched.search_hint")}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* === Sample Data Modal === */}
      <Modal
        open={showSampleModal}
        onClose={() => setShowSampleModal(false)}
        title={t("sample_modal.title")}
        footer={
          <>
            <button className="btn btn-primary" onClick={loadSampleData}>
              {t("sample_modal.load_sample")}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowSampleModal(false)}>
              {t("common.close")}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground mb-2">{t("sample_modal.format1_title")}</p>
        <pre className="bg-muted/50 border border-border rounded-lg p-3 overflow-x-auto text-xs mb-4">{`{\n  "meta": { "user": "...", "export_date": "..." },\n  "items": [\n    { "title": "The Shawshank Redemption", "user_rating": 9 }\n  ]\n}`}</pre>
        <p className="text-sm text-muted-foreground mb-2">{t("sample_modal.format2_title")}</p>
        <pre className="bg-muted/50 border border-border rounded-lg p-3 overflow-x-auto text-xs">{`{\n  "movies": [\n    { "title": "Inception", "rating": 8.8, "year": 2010 }\n  ]\n}`}</pre>
      </Modal>

      {/* === Batch Rating Modal === */}
      <Modal
        open={batchRatingOpen}
        onClose={() => setBatchRatingOpen(false)}
        title={t("watched_batch_rating.title", { count: selectedIds.size })}
        footer={
          <div className="flex items-center gap-2 w-full justify-end">
            <button className="btn btn-ghost btn-sm" onClick={() => setBatchRatingOpen(false)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary btn-sm" onClick={confirmBatchRating}>
              {t("common.confirm")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="text-center">
            <div className="text-5xl font-bold text-amber tabular-nums count-badge" key={batchRatingValue}>
              {batchRatingValue.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">/ 10</div>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={batchRatingValue}
            onChange={(e) => { setBatchRatingValue(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
            className="w-full max-w-xs h-1.5 sm:h-1.5 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer touch-manipulation
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
              max-sm:[&::-webkit-slider-thumb]:w-7 max-sm:[&::-webkit-slider-thumb]:h-7
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
              [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out
              [&::-webkit-slider-thumb]:hover:scale-110
              active:[&::-webkit-slider-thumb]:scale-125 active:[&::-webkit-slider-thumb]:shadow-amber/40
              [&::-webkit-slider-track]:h-1.5 [&::-webkit-slider-track]:rounded-full
              max-sm:[&::-webkit-slider-track]:h-2.5"
          />
          <div className="flex items-center justify-between w-full max-w-xs text-xs text-muted-foreground">
            <span>0</span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-amber" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {t("watched_batch_rating.hint")}
            </span>
            <span>10</span>
          </div>
        </div>
      </Modal>

      {/* === Saved Item Detail Modal === */}
      <DetailModal
        open={detailMovie !== null}
        movie={detailMovie}
        onClose={() => setDetailMovie(null)}
      />
    </div>
  );
}

/* ── Memo-ized grid card — cinematic poster with overlay ─────── */
const MovieGridCard = memo(function MovieGridCard({ movie, isSelected, onToggle, onRemove, onSaveRating, onOpenDetail }: {
  movie: MediaDetail;
  isSelected: boolean;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onSaveRating: (id: number, rating: number) => Promise<void>;
  onOpenDetail: (movie: MediaDetail) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [localSlider, setLocalSlider] = useState(movie.rating);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setEditing(false); setLocalSlider(movie.rating); setJustSaved(false); }, [movie.id, movie.rating]);

  const handleStartEdit = useCallback(() => {
    setLocalSlider(movie.rating);
    setEditing(true);
  }, [movie.rating]);

  const handleSave = useCallback(() => {
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    onSaveRating(movie.id, localSlider);
  }, [movie.id, localSlider, onSaveRating]);

  const handleCancel = useCallback(() => setEditing(false), []);

  return (
    <div className={`group relative overflow-hidden rounded-xl transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
      {/* Checkbox — always visible on mobile, hover on desktop */}
      <input type="checkbox"
        className="absolute top-2 left-2 z-20 w-4 h-4 accent-primary cursor-pointer opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity duration-200"
        checked={isSelected} onChange={() => onToggle(movie.id)} />
      {/* Delete button — always visible on mobile, hover on desktop */}
      <button
        className="absolute top-2 right-2 z-20 flex items-center justify-center w-6 h-6 sm:w-6 sm:h-6 rounded-full bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 max-sm:opacity-100 hover:bg-red-500/80 hover:text-white transition-all duration-200 backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); onRemove(movie.id); }} title={t("watched.remove")}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>
      {/* Poster */}
      <div className="aspect-[2/3] relative cursor-pointer overflow-hidden" onClick={() => onOpenDetail(movie)}>
        {movie.poster_url ? (
          <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />          ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30 bg-muted/40">
            <Film size={28} className="opacity-50" />
          </div>
        )}
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />
        {/* Year badge top-left */}
        {movie.year && (
          <div className="absolute top-2 left-2 z-10">
            <span className="text-[10px] font-semibold text-white bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-md">{movie.year}</span>
          </div>
        )}
        {/* TV badge */}
        {movie.media_type === "tv" && (
          <div className="absolute top-2 left-2 z-10" style={{ marginTop: movie.year ? '18px' : '0' }}>
            <Badge className="text-[9px] text-sky-200 border-sky-400/40 bg-sky-500/20 backdrop-blur-sm">TV</Badge>
          </div>
        )}

        {/* Title on poster */}
        <div className="absolute bottom-0 inset-x-0 p-2.5 z-10">
          <div className="font-semibold text-sm text-white leading-tight line-clamp-2 drop-shadow-sm">{movie.title}</div>
          {/* Season info */}
          {movie.season_number != null && (
            <div className="flex items-center gap-1 mt-1">
              <Badge className="text-[9px] text-violet-200 border-violet-400/40 bg-violet-500/20 backdrop-blur-sm leading-none px-1.5 py-0.5">
                S{movie.season_number}{movie.episode_count != null && <span className="ml-0.5 opacity-80">· {movie.episode_count}ep</span>}
              </Badge>
            </div>
          )}
        </div>
      </div>
      {/* Rating editing */}
      <div className="px-2.5 py-2 border-t border-border/50">
        {editing ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <input type="range" min={0} max={10} step={0.5} value={localSlider}
              onChange={(e) => { setLocalSlider(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
              onMouseUp={handleSave} onTouchEnd={handleSave}
              onBlur={handleSave}
              onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); if (e.key === "Enter") handleSave(); }}
              className={SLIDER_RANGE_CLASS} autoFocus />
            <span className="text-amber font-semibold text-xs min-w-[24px] text-center count-badge" key={localSlider}>
              {localSlider.toFixed(1)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <span
              className={`inline-flex items-center gap-1 text-xs cursor-pointer transition-all duration-200 px-2 py-0.5 rounded-full hover:bg-amber/10 ${justSaved ? 'text-green' : 'text-muted-foreground hover:text-amber'}`}
              onClick={handleStartEdit} title={t("watched.click_to_edit")}>
              <span className="text-amber">★</span>
              {justSaved && <span className="text-green text-[10px]">✓</span>}
              <span className="font-semibold">{movie.rating.toFixed(1)}</span>
              <span className="text-[9px] opacity-50 ml-0.5">{t("watched.edit")}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

/* ── Memo-ized list item — rich layout with poster & metadata ── */
const MovieListItem = memo(function MovieListItem({ movie, isSelected, onToggle, onRemove, onSaveRating, onOpenDetail }: {
  movie: MediaDetail;
  isSelected: boolean;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onSaveRating: (id: number, rating: number) => Promise<void>;
  onOpenDetail: (movie: MediaDetail) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [localSlider, setLocalSlider] = useState(movie.rating);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setEditing(false); setLocalSlider(movie.rating); setJustSaved(false); }, [movie.id, movie.rating]);

  const handleStartEdit = useCallback(() => {
    setLocalSlider(movie.rating);
    setEditing(true);
  }, [movie.rating]);

  const handleSave = useCallback(() => {
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    onSaveRating(movie.id, localSlider);
  }, [movie.id, localSlider, onSaveRating]);

  const handleCancel = useCallback(() => setEditing(false), []);

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
            <input type="range" min={0} max={10} step={0.5} value={localSlider}
              onChange={(e) => { setLocalSlider(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
              onMouseUp={handleSave} onTouchEnd={handleSave}
              onBlur={handleSave}
              onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); if (e.key === "Enter") handleSave(); }}
              className={SLIDER_RANGE_CLASS_LIST} autoFocus />
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
            <span className="font-bold text-sm">{movie.rating.toFixed(1)}</span>
          </span>
        )}
        <button
          className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100 max-sm:opacity-100"
          onClick={() => onRemove(movie.id)} title={t("watched.remove")}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>
      </div>
    </div>
  );
});

/* ── Memo-ized mobile card — compact card layout for small screens ── */
const WatchedMobileCard = memo(function WatchedMobileCard({ movie, isSelected, onToggle, onRemove, onSaveRating, onOpenDetail }: {
  movie: MediaDetail;
  isSelected: boolean;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onSaveRating: (id: number, rating: number) => Promise<void>;
  onOpenDetail: (movie: MediaDetail) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [localSlider, setLocalSlider] = useState(movie.rating);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setEditing(false); setLocalSlider(movie.rating); setJustSaved(false); }, [movie.id, movie.rating]);

  const handleStartEdit = useCallback(() => {
    setLocalSlider(movie.rating);
    setEditing(true);
  }, [movie.rating]);

  const handleSave = useCallback(() => {
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    onSaveRating(movie.id, localSlider);
  }, [movie.id, localSlider, onSaveRating]);

  const handleCancel = useCallback(() => setEditing(false), []);

  return (
    <div
      className={`p-3 rounded-xl transition-all duration-200 ${isSelected ? "ring-1 ring-primary/40" : ""}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}
    >
      {/* Row 1: Checkbox + Poster + Title/Meta */}
      <div className="flex items-start gap-2.5">
        <input type="checkbox"
          className="shrink-0 w-5 h-5 accent-primary cursor-pointer mt-1"
          checked={isSelected} onChange={() => onToggle(movie.id)} />

        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer"
          style={{ border: "1px solid var(--border-subtle)" }}
          onClick={() => onOpenDetail(movie)}
        >
          {movie.poster_url ? (
            <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
          ) : (
            <Film size={16} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate" onClick={() => onOpenDetail(movie)}>{movie.title}</span>
                {movie.media_type === "tv" && (
                  <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/80">
                {movie.year && <span>{movie.year}</span>}
                {movie.genre && <span className="truncate">{translateGenres(movie.genre)}</span>}
                {movie.runtime && <span>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
              </div>
              {movie.director && (
                <p className="text-[11px] text-muted-foreground/50 mt-0.5 truncate">{movie.director}</p>
              )}
            </div>
            <ChevronRight size={14} className="shrink-0 mt-0.5" style={{ color: "var(--fg-dim)" }} />
          </div>
        </div>
      </div>

      {/* Row 2: Rating + Actions */}
      <div className="flex items-center gap-1 mt-2.5 pt-2.5 overflow-x-auto no-scrollbar" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {/* Rating */}
        {editing ? (
          <div className="flex items-center gap-1.5 px-2 py-1" onClick={(e) => e.stopPropagation()}>
            <input type="range" min={0} max={10} step={0.5} value={localSlider}
              onChange={(e) => { setLocalSlider(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
              onMouseUp={handleSave} onTouchEnd={handleSave}
              onBlur={handleSave}
              onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); if (e.key === "Enter") handleSave(); }}
              className={SLIDER_RANGE_CLASS_LIST} autoFocus />
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
        <span className="w-[1px] h-4 bg-border/50 shrink-0" />
        {/* Detail */}
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-sky hover:bg-sky/10"
          onClick={() => onOpenDetail(movie)}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
          <span>{t("manage.detail")}</span>
        </button>
        {/* Remove */}
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
          onClick={() => onRemove(movie.id)}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
          <span>{t("watched.remove")}</span>
        </button>
      </div>
    </div>
  );
}, (prev, next) => {
  const id = prev.movie.id;
  if (prev.movie.title !== next.movie.title) return false;
  if (prev.movie.rating !== next.movie.rating) return false;
  if (prev.movie.year !== next.movie.year) return false;
  if (prev.movie.genre !== next.movie.genre) return false;
  if (prev.movie.poster_url !== next.movie.poster_url) return false;
  if (prev.movie.media_type !== next.movie.media_type) return false;
  if (prev.movie.season_number !== next.movie.season_number) return false;
  if (prev.movie.episode_count !== next.movie.episode_count) return false;
  if (prev.movie.runtime !== next.movie.runtime) return false;
  if (prev.movie.director !== next.movie.director) return false;
  if (prev.isSelected !== next.isSelected) return false;
  return true;
});

