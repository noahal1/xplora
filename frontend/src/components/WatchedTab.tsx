import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Movie, MovieImport, SortField, SortDir } from "../types";
import { parseCSV, parseMovieData } from "../utils/csv";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { useEnrich } from "../context/EnrichContext";
import { Separator } from "./ui/separator";
import { Modal } from "./Modal";
import { Pagination } from "./Pagination";
import { ProgressiveImage } from "./ProgressiveImage";
import { Upload, List, LayoutGrid } from "lucide-react";
import { Badge } from "./ui/badge";

const PAGE_SIZE = 30;

export function WatchedTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling, checkStatus } = useEnrich();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [movies, setMovies] = useState<Movie[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [showSampleModal, setShowSampleModal] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const [editingRating, setEditingRating] = useState<number | null>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [batchRatingOpen, setBatchRatingOpen] = useState(false);
  const [batchRatingValue, setBatchRatingValue] = useState(7);
  const dragCounterRef = useRef(0);
  const [viewMode, setViewMode] = useState<"list" | "grid">(
    () => (localStorage.getItem("xplore-watched-view") as "list" | "grid") || "list"
  );

  // ── Load data from API ──

  const loadMovies = useCallback(async (page: number, search: string, sortF: string, sortD: string, rating: string, mediaType: string) => {
    setLoading(true);
    let ratingMin: number | undefined;
    let ratingMax: number | undefined;
    if (rating && rating !== "all") {
      const [min, max] = rating.split("-").map(Number);
      ratingMin = min;
      ratingMax = max;
    }
    try {
      const data = await api.listMovies({
        page,
        page_size: PAGE_SIZE,
        status: "watched",
        search: search || undefined,
        sort_field: sortF,
        sort_dir: sortD,
        rating_min: ratingMin,
        rating_max: ratingMax,
        media_type: (mediaType !== "all" ? mediaType : undefined),
      });
      setMovies(
        data.movies.map((m) => ({
          id: m.id,
          title: m.title,
          rating: m.rating,
          year: m.year,
          genre: m.genre,
          poster_url: m.poster_url,
          media_type: m.media_type,
        }))
      );
      setTotal(data.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovies(currentPage, searchQuery, sortField, sortDir, ratingFilter, mediaTypeFilter);
  }, [currentPage, searchQuery, sortField, sortDir, ratingFilter, mediaTypeFilter, reloadTrigger, loadMovies]);

  // Check for ongoing enrichment on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

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
        selectedIds.size > 0 && !movies.every((m) => selectedIds.has(m.id));
    }
  }, [selectedIds, movies]);

  useEffect(() => {
    localStorage.setItem("xplore-watched-view", viewMode);
  }, [viewMode]);

  // ── Import helpers ──

  const saveAndReload = useCallback(
    async (raw: MovieImport[], toastMsg: string) => {
      try {
        await api.replaceMovies(raw);
        showToast(toastMsg, "success");
        // Start polling for background metadata enrichment
        startPolling();
        setCurrentPage(0);
        setSearchQuery("");
        setRatingFilter("all");
        setSelectedIds(new Set());
        setReloadTrigger((n) => n + 1);
      } catch (err: any) {
        showToast(t("watched_import.save_failed", { message: err.message }), "error");
      }
    },
    [showToast, startPolling, t]
  );

  const importMovies = useCallback(
    (raw: MovieImport[]) => {
      saveAndReload(raw, t("watched_import.data_parsed", { count: raw.length }));
    },
    [saveAndReload, t]
  );

  const loadSampleData = useCallback(() => {
    const sample: MovieImport[] = [
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
          let movies: MovieImport[];
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
    const allSelected = movies.every((m) => selectedIds.has(m.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) movies.forEach((m) => next.delete(m.id));
      else movies.forEach((m) => next.add(m.id));
      return next;
    });
  }, [movies, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const openBatchRating = useCallback(() => {
    if (selectedIds.size === 0) return;
    setBatchRatingValue(7);
    setBatchRatingOpen(true);
  }, [selectedIds]);

  const confirmBatchRating = useCallback(async () => {
    const rounded = Math.round(batchRatingValue * 10) / 10;
    const targets = movies.filter((m) => selectedIds.has(m.id));
    const results = await Promise.allSettled(
      targets.map((movie) =>
        api.updateMovie(movie.id, {
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
    reloadCurrentPage();
  }, [batchRatingValue, selectedIds, movies, showToast, reloadCurrentPage, t]);

  const removeMovie = useCallback(
    async (id: number) => {
      try {
        await api.deleteMovie(id);
        // If we just deleted the last item on a non-first page, go back
        const willBeEmpty = movies.length <= 1;
        if (willBeEmpty && currentPage > 0) {
          setCurrentPage((p) => p - 1);
        } else {
          reloadCurrentPage();
        }
      } catch (err: any) {
        showToast(t("watched.delete_failed", { message: err.message }), "error");
      }
    },
    [movies.length, currentPage, reloadCurrentPage, showToast, t]
  );

  const startRatingEdit = useCallback(
    (id: number) => {
      const movie = movies.find((m) => m.id === id);
      setSliderValue(movie ? movie.rating : 7);
      setEditingRating(id);
    },
    [movies]
  );

  const saveRatingEdit = useCallback(
    async (id: number, newRating: number) => {
      const val = Math.round(Math.max(0, Math.min(10, newRating)) * 10) / 10;
      setEditingRating(null);
      try {
        const movie = movies.find((m) => m.id === id);
        if (!movie) return;
        await api.updateMovie(id, {
          title: movie.title,
          rating: val,
          year: movie.year,
          genre: movie.genre,
        });
        reloadCurrentPage();
      } catch {
        // silent
      }
    },
    [movies, reloadCurrentPage]
  );

  // ── Filtering & pagination ──

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* === Collapsible Import Section === */}
      <section className="section-card">
        <div
          onClick={() => setImportOpen(!importOpen)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setImportOpen(!importOpen);
            }
          }}
          role="button"
          tabIndex={0}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 w-full cursor-pointer mb-0"
        >
          <h2 className="section-title flex items-center gap-2 text-base">
            <svg className="w-4 h-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="truncate">{t("watched.import_title")}</span>
          </h2>
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            <button
              className="btn btn-ghost btn-xs shrink-0"
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
              <span className="hidden sm:inline">{t("watched.sample_format")}</span>
            </button>
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${importOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {importOpen && (
          <div className="animate-slide-down">
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
                className="py-10 px-4 text-center cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={`text-3xl mb-3 transition-transform ${isDragOver ? "scale-110" : ""}`}>📂</div>
                <p className={`text-sm font-medium ${isDragOver ? "text-primary" : ""}`}>{t("watched.drag_hint")}</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">{t("watched.import_json_or_csv")}</p>
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
              </div>

              {isDragOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 rounded-xl z-10 animate-overlay-fade">
                  <div className="text-4xl">📎</div>
                  <div className="text-sm font-semibold text-primary">{t("watched.drop_release")}</div>
                  <span className="badge text-[10px]">JSON / CSV</span>
                </div>
              )}
            </div>

            {/* Manual Input */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs text-muted-foreground">{t("watched.or_manual_input")}</span>
              </div>
            </div>
            <div className="space-y-3">
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='[\n  {"title": "The Shawshank Redemption", "rating": 9.3, "year": 1994, "genre": "Drama"},\n  {"title": "The Dark Knight", "rating": 9.0, "year": 2008, "genre": "Action / Crime"}\n]'
                rows={5}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground font-mono text-xs leading-relaxed resize-y min-h-[100px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground"
              />
              <button className="btn btn-ghost text-xs" onClick={handleManualParse}>
                {t("watched.parse_data")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* === Movie List Section === */}
      {total > 0 && (
        <section className="section-card animate-slide-down">
          <div className="section-header">
            <h2 className="section-title flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
              </svg>
              {t("watched.title")}
            </h2>
            <div className="flex items-center gap-2">
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
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(0);
                }}
                className="input-field pl-3 pr-8 py-2 h-auto text-sm"
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(0);
                  }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setImportOpen(true)}
              className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm shrink-0"
              title={t("watched.import_title")}
            >
              <Upload size={14} />
              <span className="hidden sm:inline">{t("watched.import_title")}</span>
            </button>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto sm:flex-wrap pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
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
                onClick={() => {
                  if (sortField === opt.field) {
                    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                  } else {
                    setSortField(opt.field);
                    setSortDir(opt.field === "title" ? "asc" : "desc");
                  }
                  setCurrentPage(0);
                }}
              >
                {opt.label}{" "}
                {sortField === opt.field && (
                  <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </div>

          {/* Rating Filters */}
          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto sm:flex-wrap pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
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
          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto sm:flex-wrap pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
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
              {movies.length > 0 && (
                <label className="flex items-center gap-2 mb-2 px-1 w-fit cursor-pointer select-none">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    className="w-4 h-4 accent-primary cursor-pointer"
                    checked={movies.length > 0 && movies.every((m) => selectedIds.has(m.id))}
                    onChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">{t("watched.select_all")}</span>
                </label>
              )}

              {/* Movie List / Grid */}
              {movies.length === 0 && (searchQuery || ratingFilter !== "all" || mediaTypeFilter !== "all") ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t("watched.no_match")}
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {movies.map((m) => (
                    <div
                      key={m.id}
                      className={`card card-lift group relative overflow-hidden ${
                        selectedIds.has(m.id) ? "card-glow" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="absolute top-2 left-2 z-20 w-4 h-4 accent-primary cursor-pointer"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleSelection(m.id)}
                      />
                      <button
                        className="absolute top-2 right-2 z-20 flex items-center justify-center w-6 h-6 rounded-md bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                        onClick={() => removeMovie(m.id)}
                        title={t("watched.remove")}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                      <div className="aspect-[2/3] bg-muted overflow-hidden">
                        {m.poster_url ? (
                          <ProgressiveImage src={m.poster_url} alt={m.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl opacity-40">🎬</div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="truncate font-medium text-sm" title={m.title}>
                          {m.title}
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-1">
                          <span className="flex items-center gap-1.5">
                            <span className="shrink-0 text-xs text-muted-foreground">{m.year ?? ""}</span>
                            {m.media_type === "tv" && (
                              <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5">TV</Badge>
                            )}
                          </span>
                          {editingRating === m.id ? (
                            <span
                              className="inline-flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="range"
                                min={0}
                                max={10}
                                step={0.5}
                                value={sliderValue}
                                onChange={(e) => setSliderValue(parseFloat(e.target.value))}
                                onMouseUp={() => saveRatingEdit(m.id, sliderValue)}
                                onTouchEnd={() => saveRatingEdit(m.id, sliderValue)}
                                onBlur={() => saveRatingEdit(m.id, sliderValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingRating(null);
                                  if (e.key === "Enter") saveRatingEdit(m.id, sliderValue);
                                }}
                                className="w-14 h-1 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer
                                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-md
                                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
                                autoFocus
                              />
                              <span className="text-amber font-medium text-xs min-w-[24px] text-center count-badge" key={sliderValue}>
                                {sliderValue.toFixed(1)}
                              </span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-xs cursor-pointer border-b border-dashed border-border hover:border-primary"
                              onClick={() => startRatingEdit(m.id)}
                              title={t("watched.click_to_edit")}
                            >
                              <span className="text-amber">★</span> {m.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {movies.map((m) => (
                    <div
                      key={m.id}
                      className={`card card-lift p-3 flex items-center gap-2.5 text-sm transition-all ${
                        selectedIds.has(m.id) ? "border-primary/20" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="shrink-0 w-4 h-4 accent-primary"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleSelection(m.id)}
                      />
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <span className="truncate max-w-[180px] font-medium" title={m.title}>
                          {m.title}
                        </span>
                        {m.media_type === "tv" && (
                          <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {editingRating === m.id ? (
                            <span
                              className="inline-flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="range"
                                min={0}
                                max={10}
                                step={0.5}
                                value={sliderValue}
                                onChange={(e) => setSliderValue(parseFloat(e.target.value))}
                                onMouseUp={() => saveRatingEdit(m.id, sliderValue)}
                                onTouchEnd={() => saveRatingEdit(m.id, sliderValue)}
                                onBlur={() => saveRatingEdit(m.id, sliderValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingRating(null);
                                  if (e.key === "Enter") saveRatingEdit(m.id, sliderValue);
                                }}
                                className="w-20 h-1 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer
                                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-md
                                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
                                autoFocus
                              />
                              <span className="text-amber font-medium min-w-[28px] text-center count-badge" key={sliderValue}>
                                {sliderValue.toFixed(1)}
                              </span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 cursor-pointer border-b border-dashed border-border hover:border-primary"
                              onClick={() => startRatingEdit(m.id)}
                              title={t("watched.click_to_edit")}
                            >
                              <span className="text-amber">★</span> {m.rating.toFixed(1)}
                            </span>
                          )}
                        </span>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => removeMovie(m.id)}
                        title={t("watched.remove")}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
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
            {searchQuery || ratingFilter !== "all" ? (
              <>
                <p className="text-sm font-medium">{t("watched.no_match")}</p>
                <button
                  className="btn btn-ghost btn-sm mt-3"
                  onClick={() => {
                    setSearchQuery("");
                    setRatingFilter("all");
                    setMediaTypeFilter("all");
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
                <button
                  className="btn btn-ghost btn-sm mt-3"
                  onClick={() => setImportOpen(true)}
                >
                  {t("watched.import_title")}
                </button>
              </>
            )}
          </div>
        </section>
      )}

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
            onChange={(e) => setBatchRatingValue(parseFloat(e.target.value))}
            className="w-full max-w-xs h-1.5 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
              [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
              [&::-webkit-slider-track]:h-1.5 [&::-webkit-slider-track]:rounded-full"
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
    </div>
  );
}
