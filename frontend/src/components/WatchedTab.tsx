import { useState, useRef, useCallback, useEffect, memo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaItem, MediaImport, MediaSearchResult, SortField, SortDir } from "../types";
import { parseCSV, parseMovieData } from "../utils/csv";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { useEnrich } from "../context/EnrichContext";
import { Separator } from "./ui/separator";
import { Modal } from "./Modal";
import { Pagination } from "./Pagination";
import { ProgressiveImage } from "./ProgressiveImage";
import { Upload, List, LayoutGrid, Loader2 } from "lucide-react";
import { Badge } from "./ui/badge";

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
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
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
  const externalSearchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchSourceRef = useRef(searchSource);
  searchSourceRef.current = searchSource;
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const [importOpen, setImportOpen] = useState(false);
  const [batchRatingOpen, setBatchRatingOpen] = useState(false);
  const [batchRatingValue, setBatchRatingValue] = useState(7);
  const dragCounterRef = useRef(0);
  const [viewMode, setViewMode] = useState<"list" | "grid">(
    () => (localStorage.getItem("xplora-watched-view") as "list" | "grid") || "list"
  );

  // ── Load data from API ──

  const loadMovies = useCallback(async (page: number, search: string, sortF: string, sortD: string, rating: string, mediaType: string, signal?: AbortSignal) => {
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
        search: search || undefined,
        sort_field: sortF,
        sort_dir: sortD,
        rating_min: ratingMin,
        rating_max: ratingMax,
        media_type: (mediaType !== "all" ? mediaType : undefined),
        signal,
      });
      if (signal?.aborted) return;
      setMedia(
        data.media.map((m) => ({
          id: m.id,
          title: m.title,
          rating: m.rating,
          year: m.year,
          genre: m.genre,
          poster_url: m.poster_url,
          media_type: m.media_type,
          tv_series_id: m.tv_series_id,
          season_number: m.season_number,
          episode_count: m.episode_count,
          series_poster_url: m.series_poster_url,
        }))
      );
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
    loadMovies(currentPage, searchQuery, sortField, sortDir, ratingFilter, mediaTypeFilter, controller.signal);
    return () => controller.abort();
  }, [currentPage, searchQuery, sortField, sortDir, ratingFilter, mediaTypeFilter, reloadTrigger, loadMovies]);

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

  const handleExternalSearch = useCallback(async (q: string) => {
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
  }, []);

  const handleSearchInputChange = useCallback((value: string) => {
    setExternalQuery(value);
    setSearchDone(false);
    if (externalSearchTimeoutRef.current) clearTimeout(externalSearchTimeoutRef.current);
    if (!value.trim()) { setSearchResults([]); setSearchError(""); return; }
    externalSearchTimeoutRef.current = setTimeout(() => handleExternalSearch(value), 350);
  }, [handleExternalSearch]);

  const changeSearchSource = useCallback((source: string) => {
    setSearchSource(source);
    if (externalQuery.trim()) handleExternalSearch(externalQuery);
  }, [externalQuery, handleExternalSearch]);

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

  // Clear debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (externalSearchTimeoutRef.current) clearTimeout(externalSearchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("xplora-watched-view", viewMode);
  }, [viewMode]);

  // ── Import helpers ──

  const saveAndReload = useCallback(
    async (raw: MovieImport[], toastMsg: string) => {
      try {
        await api.replaceMedia(raw);
        showToast(toastMsg, "success");
        // Start polling for background metadata enrichment
        startPolling();
        setCurrentPage(0);
        setSearchInput("");
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

      {/* === External Search Section === */}
      <section className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            {t("watched.search_title")}
          </h2>
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)" }}>
            {[{ value: "auto", label: t("search_source.auto") }, { value: "tmdb", label: t("search_source.tmdb") }, { value: "tvmaze", label: t("search_source.tvmaze") }].map((opt) => (
              <button key={opt.value} className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${searchSource === opt.value ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => changeSearchSource(opt.value)}>{opt.label}</button>
            ))}
          </div>
        </div>

        <div className="relative">
          <input type="text" placeholder={t("watched.search_placeholder_external")}
            value={externalQuery} onChange={(e) => handleSearchInputChange(e.target.value)}
            className="input-field w-full h-10 text-sm pl-3 pr-20" />
          {externalQuery && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchLoading && <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />}
              <button className="text-muted-foreground hover:text-foreground p-0.5"
                onClick={() => { setExternalQuery(""); setSearchResults([]); setSearchDone(false); setSearchError(""); }}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 animate-slide-down space-y-1.5">
            <p className="text-xs text-muted-foreground mb-2">{t("wishlist.search_results")}</p>
            {searchResults.map((r, i) => {
              const key = `${r.source}:${r.source_id}`;
              const isAdding = addingSearchIds.has(key);
              return (
                <div key={`${key}-${i}`} className="card card-lift p-3 flex items-center gap-3 text-sm">
                  <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
                    {r.poster_url ? <ProgressiveImage src={r.poster_url} alt={r.title} className="w-full h-full object-cover" /> : <span className="opacity-40">🎬</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{r.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {r.year && <span className="text-xs text-muted-foreground">{r.year}</span>}
                      {r.genre && <Badge variant="outline" className="text-[10px]">{r.genre}</Badge>}
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
          <div className="mt-4 text-center py-4 text-muted-foreground">
            <p className="text-sm">{t("wishlist.search_empty", { query: externalQuery })}</p>
            <p className="text-xs mt-1">{t("wishlist.search_empty_hint")}</p>
          </div>
        )}
        {searchError && <div className="mt-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{searchError}</div>}

        {!externalQuery && !searchLoading && searchResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <svg className="w-8 h-8 mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm">{t("watched.search_hint")}</p>
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
                value={searchInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchInput(value);
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                  searchTimeoutRef.current = setTimeout(() => {
                    setSearchQuery(value);
                    setCurrentPage(0);
                  }, 300);
                }}
                className="input-field pl-3 pr-8 py-2 h-auto text-sm"
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    setSearchInput("");
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
              {media.length === 0 && (searchQuery || ratingFilter !== "all" || mediaTypeFilter !== "all") ? (
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
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {media.map((m) => (
                    <MovieListItem
                      key={m.id}
                      movie={m}
                      isSelected={selectedIds.has(m.id)}
                      onToggle={toggleSelection}
                      onRemove={removeMovie}
                      onSaveRating={handleSaveRating}
                    />
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
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    setSearchInput("");
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
    </div>
  );
}

/* ── Memo-ized grid card — local editing state prevents slider-drag
   from re-rendering all 30 grid items ────────────────────────── */
const MovieGridCard = memo(function MovieGridCard({ movie, isSelected, onToggle, onRemove, onSaveRating }: {
  movie: MediaItem;
  isSelected: boolean;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onSaveRating: (id: number, rating: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [localSlider, setLocalSlider] = useState(movie.rating);
  const [justSaved, setJustSaved] = useState(false);

  // Reset when movie changes (page navigation)
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
    <div className={`card card-lift group relative overflow-hidden ${isSelected ? "card-glow" : ""}`}>
      <input type="checkbox" className="absolute top-2 left-2 z-20 w-4 h-4 accent-primary cursor-pointer"
        checked={isSelected} onChange={() => onToggle(movie.id)} />
      <button className="absolute top-2 right-2 z-20 flex items-center justify-center w-6 h-6 rounded-md bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
        onClick={() => onRemove(movie.id)} title={t("watched.remove")}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>
      <div className="aspect-[2/3] bg-muted overflow-hidden">
        {movie.poster_url ? (
          <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-40">🎬</div>
        )}
      </div>
      <div className="p-2.5">
        <div className="truncate font-medium text-sm" title={movie.title}>{movie.title}</div>
        <div className="flex items-center justify-between gap-1 mt-1">
          <span className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs text-muted-foreground">{movie.year ?? ""}</span>
            {movie.media_type === "tv" && (
              <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
            )}
            {movie.season_number != null && (
              <Badge variant="outline" className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5 shrink-0">
                S{movie.season_number}{movie.episode_count != null && <span className="ml-0.5 opacity-70">· {movie.episode_count}ep</span>}
              </Badge>
            )}
          </span>
          {editing ? (
            <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input type="range" min={0} max={10} step={0.5} value={localSlider}
                onChange={(e) => { setLocalSlider(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
                onMouseUp={handleSave} onTouchEnd={handleSave}
                onBlur={handleSave}
                onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); if (e.key === "Enter") handleSave(); }}
                className={SLIDER_RANGE_CLASS} autoFocus />
              <span className="text-amber font-medium text-xs min-w-[24px] text-center count-badge" key={localSlider}>
                {localSlider.toFixed(1)}
              </span>
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 text-xs cursor-pointer border-b border-dashed ${justSaved ? 'border-green saved-confirm' : 'border-border hover:border-primary'}`}
              onClick={handleStartEdit} title={t("watched.click_to_edit")}>
              <span className="text-amber">★</span>
              {justSaved && <span className="text-green text-[10px]">✓</span>}
              <span>{movie.rating.toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

/* ── Memo-ized list item — local editing state prevents slider-drag
   from re-rendering all 30 list rows ─────────────────────────── */
const MovieListItem = memo(function MovieListItem({ movie, isSelected, onToggle, onRemove, onSaveRating }: {
  movie: MediaItem;
  isSelected: boolean;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onSaveRating: (id: number, rating: number) => Promise<void>;
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
    <div className={`card card-lift p-3 flex items-center gap-2.5 text-sm transition-all ${isSelected ? "border-primary/20" : ""}`}>
      <input type="checkbox" className="shrink-0 w-4 h-4 accent-primary"
        checked={isSelected} onChange={() => onToggle(movie.id)} />
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <span className="truncate max-w-[180px] font-medium" title={movie.title}>{movie.title}</span>
        {movie.media_type === "tv" && (
          <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
        )}
        {movie.season_number != null && (
          <Badge variant="outline" className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5 shrink-0">
            S{movie.season_number}{movie.episode_count != null && <span className="ml-0.5 opacity-70">· {movie.episode_count}ep</span>}
          </Badge>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {editing ? (
            <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input type="range" min={0} max={10} step={0.5} value={localSlider}
                onChange={(e) => { setLocalSlider(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
                onMouseUp={handleSave} onTouchEnd={handleSave}
                onBlur={handleSave}
                onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); if (e.key === "Enter") handleSave(); }}
                className={SLIDER_RANGE_CLASS_LIST} autoFocus />
              <span className="text-amber font-medium min-w-[28px] text-center count-badge" key={localSlider}>
                {localSlider.toFixed(1)}
              </span>
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 cursor-pointer border-b border-dashed ${justSaved ? 'border-green saved-confirm' : 'border-border hover:border-primary'}`}
              onClick={handleStartEdit} title={t("watched.click_to_edit")}>
              <span className="text-amber">★</span>
              {justSaved && <span className="text-green text-[10px]">✓</span>}
              <span>{movie.rating.toFixed(1)}</span>
            </span>
          )}
        </span>
      </div>
      <button className="text-muted-foreground hover:text-destructive transition-colors"
        onClick={() => onRemove(movie.id)} title={t("watched.remove")}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>
    </div>
  );
});

