import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { DBMovie, MovieSearchResult } from "../types";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { useEnrich } from "../context/EnrichContext";
import { Badge } from "./ui/badge";
import { GenreInput } from "./GenreInput";
import { Modal } from "./Modal";
import { Pagination } from "./Pagination";
import { SkeletonTable } from "./Skeleton";
import { Star, Upload, Plus, Search, Sparkles, Loader2, ExternalLink, Film, Info, X, Trash2, RefreshCw, WandSparkles, AlertCircle, Check } from "lucide-react";
import { ProgressiveImage } from "./ProgressiveImage";

const MANAGE_PAGE_SIZE = 30;

/* ── Sort helpers ─────────────────────────────────────────────── */
type SortField = "title" | "rating" | "year" | "genre" | "created_at";
type SortDir = "asc" | "desc";
interface SortConfig { field: SortField; dir: SortDir }

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

  const [movies, setMovies] = useState<DBMovie[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [errorFilter, setErrorFilter] = useState(false);
  const [sort, setSort] = useState<SortConfig>({ field: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [editingCell, setEditingCell] = useState<{ movieId: number; field: string } | null>(null);
  const [genreDialogMovie, setGenreDialogMovie] = useState<DBMovie | null>(null);
  const [genreDialogValue, setGenreDialogValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Delete confirmation modal ───────────────────────────────── */
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteAction>(null);

  /* ── TMDB search & import ────────────────────────────────────── */
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MovieSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<Set<number>>(new Set());
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<number>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);
  const [batchImportProgress, setBatchImportProgress] = useState<{ current: number; total: number } | null>(null);
  const searchTmdbRef = useRef<HTMLInputElement>(null);
  const searchTmdbTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Metadata detail modal ───────────────────────────────────── */
  const [detailMovie, setDetailMovie] = useState<DBMovie | null>(null);

  /* ── Manual search & match modal ─────────────────────────────── */
  const [rematchMovie, setRematchMovie] = useState<DBMovie | null>(null);
  const [rematchResults, setRematchResults] = useState<MovieSearchResult[]>([]);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchQuery, setRematchQuery] = useState("");
  const rematchSearchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const openRematch = useCallback(async (movie: DBMovie) => {
    setRematchMovie(movie);
    setRematchQuery(movie.title);
    setRematchResults([]);
    setRematchLoading(true);
    try {
      const data = await api.searchMovies(movie.title, "tmdb");
      setRematchResults(data.results);
    } catch {}
    setRematchLoading(false);
  }, []);

  const handleRematchSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setRematchResults([]); return; }
    setRematchLoading(true);
    try {
      const data = await api.searchMovies(q, "tmdb");
      setRematchResults(data.results);
    } catch {}
    setRematchLoading(false);
  }, []);

  const handleRematchQueryChange = useCallback((value: string) => {
    setRematchQuery(value);
    if (rematchSearchTimeout.current) clearTimeout(rematchSearchTimeout.current);
    rematchSearchTimeout.current = setTimeout(() => handleRematchSearch(value), 400);
  }, [handleRematchSearch]);

  const handleSelectRematch = useCallback(async (result: MovieSearchResult) => {
    if (!rematchMovie) return;
    try {
      await api.rematchMovie(rematchMovie.id, result.source, result.source_id);
      showToast(t("manage.rematch_success", { title: result.title }), "success");
      setRematchMovie(null);
      loadMovies();
    } catch (err: any) {
      showToast(t("manage.rematch_failed", { message: err.message }), "error");
    }
  }, [rematchMovie, loadMovies, showToast, t]);

  const loadMovies = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listMovies({
        search,
        page,
        page_size: MANAGE_PAGE_SIZE,
        status: statusFilter || undefined,
        sort_field: sort.field,
        sort_dir: sort.dir,
        has_error: errorFilter || undefined,
      });
      setMovies(data.movies);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, page, statusFilter, errorFilter, sort]);

  useEffect(() => { loadMovies(); }, [loadMovies]);

  // Auto-refresh when background enrichment completes
  useEffect(() => {
    const handler = () => { loadMovies(); };
    window.addEventListener("enrich-done", handler);
    return () => window.removeEventListener("enrich-done", handler);
  }, [loadMovies]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => { setSearch(value); setPage(0); setSelected(new Set()); }, 300);
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSort((prev) => {
      const dir: SortDir = prev.field === field ? (prev.dir === "asc" ? "desc" : "asc") : "desc";
      return { field, dir };
    });
    setPage(0);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && selected.size < movies.length;
  }, [selected, movies.length]);

  const toggleSelection = useCallback((id: number) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (movies.length === 0) return;
    const allSelected = movies.every((m) => selected.has(m.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) movies.forEach((m) => next.delete(m.id));
      else movies.forEach((m) => next.add(m.id));
      return next;
    });
  }, [movies, selected]);

  /* ── Delete handlers with modal confirmation ─────────────────── */
  const confirmDelete = useCallback((movieId: number, title: string) => {
    setDeleteConfirm({ type: "single", movieId, title });
  }, []);

  const confirmDeleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    setDeleteConfirm({ type: "selected", count: selected.size });
  }, [selected]);

  const confirmDeleteAll = useCallback(() => {
    if (total === 0) return;
    setDeleteConfirm({ type: "all", count: total });
  }, [total]);

  const executeDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const action = deleteConfirm;
    setDeleteConfirm(null);

    try {
      if (action.type === "single") {
        await api.deleteMovie(action.movieId);
        showToast(t("manage.deleted"), "success");
        setSelected((prev) => { const next = new Set(prev); next.delete(action.movieId); return next; });
      } else if (action.type === "selected") {
        const ids = Array.from(selected);
        const result = await api.batchDeleteMovies(ids);
        setSelected(new Set());
        showToast(t("manage.deleted_count", { count: result.count }), "success");
      } else if (action.type === "all") {
        await api.deleteAllMovies();
        showToast(t("manage.cleared", { count: action.count }), "success");
        setSelected(new Set());
        setPage(0);
      }
      loadMovies();
    } catch (err: any) {
      showToast(t("manage.delete_failed", { message: err.message }), "error");
    }
  }, [deleteConfirm, selected, loadMovies, showToast, t]);

  /* ── Inline editing ──────────────────────────────────────────── */
  const startInlineEdit = useCallback((movieId: number, field: string) => {
    setEditingCell({ movieId, field });
    if (field === "genre") {
      const movie = movies.find((m) => m.id === movieId);
      if (movie) {
        setGenreDialogMovie(movie);
        setGenreDialogValue(movie.genre || "");
      }
      setEditingCell(null);
      return;
    }
    setTimeout(() => editInputRef.current?.focus(), 50);
  }, [movies]);

  const cancelInlineEdit = useCallback(() => { setEditingCell(null); }, []);

  const saveInlineEdit = useCallback(async (movieId: number, field: string, value: string) => {
    const movie = movies.find((m) => m.id === movieId);
    if (!movie) return;
    let newValue: any = value.trim();
    let updatedFields: Record<string, any> = {};
    switch (field) {
      case "title": if (!newValue) return; updatedFields.title = newValue; break;
      case "rating": newValue = parseFloat(value); if (isNaN(newValue) || newValue < 0 || newValue > 10) return; updatedFields.rating = Math.round(newValue * 10) / 10; break;
      case "year": newValue = value ? parseInt(value) : null; if (value && (isNaN(newValue) || newValue < 1888 || newValue > 2030)) return; updatedFields.year = newValue; break;
    }
    const currentVal = movie[field as keyof DBMovie];
    if (updatedFields[field] === currentVal || (currentVal == null && updatedFields[field] == null)) { cancelInlineEdit(); return; }
    try {
      await api.updateMovie(movieId, {
        title: updatedFields.title ?? movie.title,
        rating: updatedFields.rating ?? movie.rating,
        year: updatedFields.year !== undefined ? updatedFields.year : movie.year,
        genre: updatedFields.genre !== undefined ? updatedFields.genre : movie.genre,
      } as any);
      showToast(t("manage.updated"), "success");
      cancelInlineEdit();
      loadMovies();
    } catch (err: any) { showToast(t("manage.save_failed", { message: err.message }), "error"); cancelInlineEdit(); }
  }, [movies, loadMovies, showToast, cancelInlineEdit, t]);

  const saveGenreDialog = useCallback(async () => {
    const movie = genreDialogMovie;
    if (!movie) return;
    const newGenre = genreDialogValue.trim() || null;
    if (newGenre === (movie.genre || null)) { setGenreDialogMovie(null); return; }
    try {
      await api.updateMovie(movie.id, {
        title: movie.title,
        rating: movie.rating,
        year: movie.year,
        genre: newGenre,
      } as any);
      showToast(t("manage.genre_updated"), "success");
      setGenreDialogMovie(null);
      loadMovies();
    } catch (err: any) { showToast(t("manage.save_failed", { message: err.message }), "error"); }
  }, [genreDialogMovie, genreDialogValue, loadMovies, showToast, t]);

  /* ── TMDB Search & Import ────────────────────────────────────── */
  const handleSearchTMDB = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSelectedSearchIds(new Set()); return; }
    setSearchLoading(true);
    setSelectedSearchIds(new Set());
    try {
      const data = await api.searchMovies(q, "tmdb");
      setSearchResults(data.results);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSearchLoading(false);
    }
  }, [showToast]);

  const openSearchDialog = useCallback(() => {
    setSearchDialogOpen(true);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedSearchIds(new Set());
    setTimeout(() => searchTmdbRef.current?.focus(), 100);
  }, []);

  const handleSearchInputChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTmdbTimeout.current) clearTimeout(searchTmdbTimeout.current);
    searchTmdbTimeout.current = setTimeout(() => handleSearchTMDB(value), 400);
  }, [handleSearchTMDB]);

  const handleImportFromSearch = useCallback(async (result: MovieSearchResult) => {
    try {
      const movie = await api.addToWishlist({
        title: result.title,
        year: result.year ?? undefined,
        genre: result.genre || undefined,
      });
      try { await api.enrichMovie(movie.id); } catch {}
      showToast(t("manage.imported_from_search", { title: result.title }), "success");
      loadMovies();
    } catch (err: any) {
      showToast(t("manage.import_failed", { message: err.message }), "error");
    }
  }, [loadMovies, showToast, t]);

  const toggleSearchSelection = useCallback((idx: number) => {
    setSelectedSearchIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleSelectAllSearchResults = useCallback(() => {
    if (searchResults.length === 0) return;
    setSelectedSearchIds(prev => {
      if (prev.size === searchResults.length) return new Set();
      return new Set(searchResults.map((_, i) => i));
    });
  }, [searchResults]);

  const handleBatchImportFromSearch = useCallback(async () => {
    const indices = Array.from(selectedSearchIds).sort((a, b) => a - b);
    if (indices.length === 0) return;

    setImportingBatch(true);
    setBatchImportProgress({ current: 0, total: indices.length });

    let existingTitles = new Set<string>();
    try {
      const titles = await api.listMovieTitles();
      titles.forEach((t) => existingTitles.add(t.toLowerCase().trim()));
    } catch {}

    let successCount = 0, skipCount = 0, failCount = 0, processedCount = 0;

    for (const idx of indices) {
      const result = searchResults[idx];
      if (!result) continue;

      const normalizedTitle = result.title.toLowerCase().trim();
      if (existingTitles.has(normalizedTitle)) {
        skipCount++; processedCount++;
        setBatchImportProgress({ current: processedCount, total: indices.length });
        continue;
      }

      try {
        const movie = await api.addToWishlist({ title: result.title, year: result.year ?? undefined, genre: result.genre || undefined });
        existingTitles.add(normalizedTitle);
        try { await api.enrichMovie(movie.id); } catch {}
        successCount++;
      } catch { failCount++; }

      processedCount++;
      setBatchImportProgress({ current: processedCount, total: indices.length });
    }

    setImportingBatch(false);
    setSelectedSearchIds(new Set());
    loadMovies();

    if (successCount === 0 && skipCount > 0) {
      showToast(t("manage.batch_import_all_duplicates", { count: skipCount }), "info");
    } else if (skipCount > 0 && failCount > 0) {
      showToast(t("manage.batch_import_skipped_errors", { imported: successCount, skipped: skipCount, failed: failCount }), "error");
    } else if (skipCount > 0) {
      showToast(t("manage.batch_import_with_skipped", { imported: successCount, skipped: skipCount }), "success");
    } else if (failCount > 0) {
      showToast(t("manage.batch_import_done_with_errors", { success: successCount, fail: failCount }), "error");
    } else {
      showToast(t("manage.batch_import_done", { count: successCount }), "success");
    }
  }, [searchResults, selectedSearchIds, loadMovies, showToast, t]);

  const handleExportMovies = useCallback(() => {
    if (movies.length === 0) return;
    const data = JSON.stringify({ movies, exported_at: new Date().toISOString(), total }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xplore-movies-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [movies, total]);

  const handleEnrich = useCallback(async (movieId: number) => {
    setEnrichingIds(prev => new Set(prev).add(movieId));
    try {
      await api.enrichMovie(movieId);
      showToast(t("manage.enrich_success"), "success");
      loadMovies();
    } catch (err: any) {
      showToast(t("manage.enrich_failed", { message: err.message }), "error");
    } finally {
      setEnrichingIds(prev => { const next = new Set(prev); next.delete(movieId); return next; });
    }
  }, [loadMovies, showToast, t]);

  /* ── Batch enrich + cache ───────────────────────────────────── */
  const [batchLoading, setBatchLoading] = useState(false);

  const handleBatchAll = useCallback(async () => {
    setBatchLoading(true);
    try {
      // Step 1: Scrape metadata for movies without posters
      const enrichResult = await api.enrichAllMovies();
      let totalEnqueued = enrichResult.enqueued;

      // Step 2: Cache existing external poster URLs to local
      const cacheResult = await api.cachePosters();
      totalEnqueued += cacheResult.enqueued;

      if (totalEnqueued > 0) {
        showToast(t("manage.batch_all_started", { count: totalEnqueued }), "success");
        startPolling();
      } else {
        showToast(t("manage.batch_all_none"), "info");
      }
    } catch (err: any) {
      showToast(t("manage.batch_all_failed", { message: err.message }), "error");
    } finally {
      setBatchLoading(false);
    }
  }, [showToast, startPolling, t]);

  /* ── Pagination helpers ──────────────────────────────────────── */
  const totalPages = Math.ceil(total / MANAGE_PAGE_SIZE);

  /* ── Sort arrow helper ───────────────────────────────────────── */
  const SortArrow = ({ field }: { field: SortField }) => (
    <span className="text-[11px] ml-1 transition-opacity" style={{ opacity: sort.field === field ? 1 : 0.25 }}>
      {sort.field === field ? (sort.dir === "asc" ? "↑" : "↓") : "↓"}
    </span>
  );

  /* ── Inline edit cell ────────────────────────────────────────── */
  const renderEditableCell = (movie: DBMovie, field: string, display: React.ReactNode) => {
    const isEditing = editingCell?.movieId === movie.id && editingCell?.field === field;
    if (isEditing) {
      let value = "", inputType = "text", widthClass = "";
      switch (field) {
        case "title": value = movie.title; widthClass = "w-full min-w-[120px]"; break;
        case "rating": inputType = "number"; widthClass = "w-[72px]"; value = movie.rating.toFixed(1); break;
        case "year": inputType = "number"; widthClass = "w-[72px]"; value = movie.year != null ? movie.year.toString() : ""; break;
      }

      const save = () => { const v = editInputRef.current?.value || ""; saveInlineEdit(movie.id, field, v); };

      return (
        <td className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1">
            <input
              ref={editInputRef}
              type={inputType}
              className={`no-spinner ${widthClass} input-field h-7 text-sm px-1.5 py-0.5`}
              defaultValue={value}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") cancelInlineEdit();
              }}
              onBlur={() => { if (editingCell?.movieId === movie.id && editingCell?.field === field) save(); }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
        </td>
      );
    }

    return (
      <td
        className="px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-accent/30 group"
        onClick={() => startInlineEdit(movie.id, field)}
        title={t("common.edit")}
      >
        <div className="flex items-center gap-1">
          {display}
          <span className="opacity-0 group-hover:opacity-40 transition-opacity">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </span>
        </div>
      </td>
    );
  };

  return (
    <section className="section-card min-h-[300px]">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="section-header">
        <h2 className="section-title flex items-center gap-2">
          <Film size={16} className="text-primary" />
          {t("manage.title")}
        </h2>
        <div className="flex gap-2 items-center">
          <span className="badge font-mono text-xs">{t("manage.total", { count: total })}</span>
          <button className="btn btn-ghost" onClick={loadMovies}>
            <RefreshCw size={13} />
            {t("manage.refresh")}
          </button>
          <button className="btn btn-ghost" onClick={handleExportMovies}>
            <Upload size={13} />
            {t("manage.export")}
          </button>
          <button
            className={`btn btn-ghost gap-1.5 ${batchLoading ? "opacity-50" : ""}`}
            onClick={handleBatchAll}
            disabled={batchLoading}
            title={t("manage.batch_all")}
          >
            {batchLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <WandSparkles size={13} />
            )}
            {t("manage.batch_all")}
          </button>
          <button className="btn btn-primary" onClick={openSearchDialog}>
            <Plus size={13} />
            {t("manage.add_movie")}
          </button>
        </div>
      </div>

      {/* ── Search & bulk actions ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={t("manage.search_placeholder")}
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="input-field pl-3 pr-8 py-2 h-auto text-sm"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setSearchInput(""); setSearch(""); setPage(0); }}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0 w-full sm:w-auto">
          <button
            className={`btn btn-xs gap-1.5 transition-all ${selected.size > 0 ? "btn-destructive" : "btn-ghost opacity-50"}`}
            disabled={selected.size === 0}
            onClick={confirmDeleteSelected}
          >
            <Trash2 size={12} />
            {t("manage.delete_selected")}
            {selected.size > 0 && <span className="tabular-nums font-mono">{selected.size}</span>}
          </button>
          <button className="btn btn-ghost btn-xs gap-1.5" onClick={confirmDeleteAll}>
            <Trash2 size={12} />
            {t("manage.clear_all")}
          </button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">{t("manage.filter")}</span>
        {[
          { value: "", label: t("manage.filter_all") },
          { value: "watched", label: t("manage.filter_watched") },
          { value: "wish", label: t("manage.filter_wish") },
        ].map((opt) => (
          <button
            key={opt.value}
            className={`pill ${statusFilter === opt.value ? "active" : ""}`}
            onClick={() => { setStatusFilter(opt.value); setErrorFilter(false); setPage(0); setSelected(new Set()); }}
          >
            {opt.label}
          </button>
        ))}
        <span className="w-[1px] h-3.5 bg-border mx-0.5" />
        <button
          className={`pill ${errorFilter ? "active text-destructive border-destructive/30" : ""}`}
          onClick={() => { setErrorFilter(!errorFilter); setStatusFilter(""); setPage(0); setSelected(new Set()); }}
        >
          <AlertCircle size={11} className="mr-1" />
          {t("manage.filter_errors")}
        </button>
      </div>

      {/* ── Sort bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">{t("manage.sort")}</span>
        {([
          { field: "created_at" as SortField, label: t("manage.sort_import_time") },
          { field: "title" as SortField, label: t("manage.sort_title") },
          { field: "rating" as SortField, label: t("manage.sort_rating") },
          { field: "year" as SortField, label: t("manage.sort_year") },
        ]).map((s) => (
          <button
            key={s.field}
            className={`pill ${sort.field === s.field ? "active" : ""}`}
            onClick={() => handleSort(s.field)}
          >
            {s.label} <SortArrow field={s.field} />
          </button>
        ))}
      </div>

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && <SkeletonTable rows={6} />}

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <X size={20} className="text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive">{t("manage.load_failed", { message: error })}</p>
          <button className="btn btn-ghost btn-xs gap-1.5" onClick={loadMovies}>
            <RefreshCw size={12} />
            {t("manage.retry")}
          </button>
        </div>
      )}

      {/* ── Empty ──────────────────────────────────────────────── */}
      {!loading && !error && movies.length === 0 && (
        <div className="empty-state">
          <Film size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {search
              ? t("manage.no_matching", { query: search })
              : t("manage.no_movies")}
          </p>
          {search && <p className="text-xs mt-1 text-muted-foreground">{t("manage.try_other")}</p>}
          {!search && (
            <button className="btn btn-primary btn-sm mt-4 gap-1.5" onClick={openSearchDialog}>
              <Plus size={13} />
              {t("manage.add_movie")}
            </button>
          )}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      {!loading && !error && movies.length > 0 && (
        <>
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="w-10 text-center px-3 py-2.5 font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">
                    <input
                      type="checkbox"
                      ref={selectAllRef}
                      className="w-4 h-4 accent-primary cursor-pointer"
                      checked={movies.length > 0 && movies.every((m) => selected.has(m.id))}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="w-[52px] px-1 py-2.5 text-center font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_poster")}</th>
                  <th className="w-14 px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_status")}</th>
                  {(["title", "rating", "year", "genre"] as const).map((field) => {
                    const colWidth = field === "title" ? 200 : field === "rating" ? 72 : field === "year" ? 60 : undefined;
                    return (
                      <th
                        key={field}
                        className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none cursor-pointer hover:text-foreground transition-colors"
                        style={colWidth ? { width: colWidth } : undefined}
                        onClick={() => handleSort(field)}
                      >
                        {field === "title" ? t("manage.col_title") : field === "rating" ? t("manage.col_rating") : field === "year" ? t("manage.col_year") : t("manage.col_genre")}
                        <SortArrow field={field} />
                      </th>
                    );
                  })}
                  <th className="w-[120px] text-center px-1 py-2.5 font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {movies.map((m) => (
                  <tr key={m.id} className={`transition-colors ${selected.has(m.id) ? "bg-primary/[0.04]" : "hover:bg-accent/20"}`}>
                    {/* Checkbox */}
                    <td className="px-3 py-2 border-b border-border text-center">
                      <input type="checkbox" className="w-4 h-4 accent-primary cursor-pointer" checked={selected.has(m.id)} onChange={() => toggleSelection(m.id)} />
                    </td>
                    {/* Poster + scrape error indicator */}
                    <td className="px-1 py-2 border-b border-border text-center">
                      <div className="relative w-[38px] h-[52px] rounded overflow-hidden bg-muted flex items-center justify-center mx-auto"
                        style={{ border: "1px solid var(--border-subtle)" }}>
                        {m.poster_url ? (
                          <img src={m.poster_url} alt={m.title} className="w-full h-full object-cover" loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : null}
                        <Film size={14} className={`text-muted-foreground/30 ${m.poster_url ? "hidden" : ""}`} />
                        {/* Scrape error tooltip */}
                        {m.scrape_error && !m.poster_url && (
                          <div className="absolute bottom-0.5 right-0.5 group">
                            <AlertCircle size={12} className="text-destructive cursor-help" />
                            <div className="absolute bottom-full right-0 mb-1.5 w-56 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] leading-relaxed shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                              <span className="font-semibold">{t("manage.scrape_error_label")}</span>
                              <br />
                              {m.scrape_error}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Status badge */}
                    <td className="px-3 py-2 border-b border-border">
                      {m.status === "wish" ? (
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
                    </td>
                    {/* Editable cells */}
                    {renderEditableCell(m, "title", <span className="font-medium max-w-[240px] truncate block">{m.title}</span>)}
                    {renderEditableCell(m, "rating", (
                      <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
                        <Star size={12} fill="var(--seed-primary)" style={{ color: "var(--seed-primary)" }} />
                        <span style={{ color: "var(--fg-secondary)" }}>{m.rating.toFixed(1)}</span>
                      </span>
                    ))}
                    {renderEditableCell(m, "year", <span className="text-muted-foreground">{m.year || "—"}</span>)}
                    {renderEditableCell(m, "genre", <span className="text-muted-foreground truncate block">{m.genre || "—"}</span>)}
                    {/* Actions */}
                    <td className="px-1 py-2 border-b border-border text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--seed-radius)", padding: "1px" }}>
                        <button className="text-muted-foreground hover:text-sky px-1.5 py-1 rounded transition-colors hover:bg-sky/10"
                          onClick={() => setDetailMovie(m)} title={t("manage.detail")}>
                          <Info size={14} />
                        </button>
                        <button className="text-muted-foreground hover:text-foreground px-1.5 py-1 rounded transition-colors hover:bg-accent"
                          onClick={() => startInlineEdit(m.id, "title")} title={t("common.edit")}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button className={`px-1.5 py-1 rounded transition-colors ${m.scrape_error ? "text-amber" : "text-muted-foreground"} hover:text-sky hover:bg-sky/10`}
                          onClick={() => openRematch(m)} title={m.scrape_error ? t("manage.rematch_error_hint") : t("manage.rematch")}>
                          <Search size={14} />
                        </button>
                        <button className={`px-1.5 py-1 rounded transition-colors ${enrichingIds.has(m.id) ? "text-primary animate-pulse" : "text-muted-foreground hover:text-amber"} hover:bg-amber/10`}
                          onClick={() => handleEnrich(m.id)} disabled={enrichingIds.has(m.id)}
                          title={enrichingIds.has(m.id) ? t("manage.enriching") : t("manage.enrich")}>
                          {enrichingIds.has(m.id) ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        </button>
                        <button className="text-muted-foreground hover:text-destructive px-1.5 py-1 rounded transition-colors hover:bg-destructive/10"
                          onClick={() => confirmDelete(m.id, m.title)} title={t("common.delete")}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ────────────────────────────────────────── */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => { setPage(p); setSelected(new Set()); }}
            info={`${t("pagination.page_info", { start: page * MANAGE_PAGE_SIZE + 1, end: Math.min((page + 1) * MANAGE_PAGE_SIZE, total) })} / ${t("manage.total", { count: total })}`}
          />
        </>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────── */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={
          deleteConfirm?.type === "single"
            ? t("manage.delete_confirm_title")
            : deleteConfirm?.type === "selected"
              ? t("manage.delete_selected_confirm_title")
              : t("manage.delete_all_confirm_title")
        }
        description={
          deleteConfirm?.type === "single"
            ? t("manage.delete_confirm_desc", { title: deleteConfirm?.title ?? "" })
            : deleteConfirm?.type === "selected"
              ? t("manage.delete_confirm_selected", { count: deleteConfirm?.count ?? 0 })
              : t("manage.delete_confirm_all", { count: deleteConfirm?.count ?? 0 })
        }
        footer={
          <div className="flex items-center gap-2 w-full justify-end">
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</button>
            <button
              className="btn btn-sm gap-1.5"
              style={{ background: "var(--destructive)", color: "#fff", borderColor: "transparent" }}
              onClick={executeDelete}
            >
              <Trash2 size={12} />
              {deleteConfirm?.type === "single" ? t("common.delete") : t("manage.delete_all_confirm_btn")}
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {deleteConfirm?.type === "all" && t("manage.delete_confirm_all2")}
        </p>
      </Modal>

      {/* ── TMDB Search & Import Dialog ─────────────────────────── */}
      <Modal
        open={searchDialogOpen}
        onClose={() => { setSearchDialogOpen(false); setSelectedSearchIds(new Set()); }}
        title={t("manage.search_tmdb")}
        description={t("manage.search_tmdb_desc")}
      >
        <div className="space-y-4">
          <input
            ref={searchTmdbRef}
            type="text"
            placeholder={t("manage.search_tmdb_placeholder")}
            value={searchQuery}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearchTMDB(searchQuery); }}
            className="input-field w-full"
          />

          {searchLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-sm">{t("manage.searching")}</span>
            </div>
          )}

          {!searchLoading && searchQuery && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search size={24} className="mb-2 opacity-40" />
              <p className="text-sm">{t("manage.no_search_results", { query: searchQuery })}</p>
            </div>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <>
              {/* Selection toolbar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-primary cursor-pointer"
                      checked={selectedSearchIds.size === searchResults.length}
                      onChange={toggleSelectAllSearchResults}
                    />
                    {t("manage.batch_select_all")}
                  </label>
                  {selectedSearchIds.size > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("manage.batch_selected", { count: selectedSearchIds.size })}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-primary btn-xs gap-1.5"
                  disabled={selectedSearchIds.size === 0 || importingBatch}
                  onClick={handleBatchImportFromSearch}
                >
                  {importingBatch && batchImportProgress ? (
                    <span className="text-xs font-mono tabular-nums">{batchImportProgress.current}/{batchImportProgress.total}</span>
                  ) : (
                    <Plus size={12} />
                  )}
                  {importingBatch ? t("manage.importing_batch") : t("manage.batch_import", { count: selectedSearchIds.size })}
                </button>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {searchResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all card-lift ${
                      selectedSearchIds.has(idx)
                        ? "border-primary/40 bg-primary/[0.04]"
                        : "border-border hover:border-primary/30 hover:bg-accent/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary cursor-pointer shrink-0"
                      checked={selectedSearchIds.has(idx)}
                      onChange={() => toggleSearchSelection(idx)}
                    />
                    <div className="w-10 h-14 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center cursor-pointer"
                      style={{ border: "1px solid var(--border-subtle)" }}
                      onClick={() => handleImportFromSearch(result)}>
                      {result.poster_url ? (
                        <img src={result.poster_url} alt={result.title} className="w-full h-full object-cover" loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <Film size={14} className="text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleImportFromSearch(result)}>
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {result.year && <span className="text-xs text-muted-foreground">{result.year}</span>}
                        {result.genre && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground truncate">{result.genre}</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Badge variant="outline" className="text-[10px]">{result.source.toUpperCase()}</Badge>
                    </div>
                    <button className="btn btn-xs shrink-0 gap-1" onClick={() => handleImportFromSearch(result)}>
                      <Plus size={12} />
                      {t("wishlist.add")}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {!searchQuery && !searchLoading && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ExternalLink size={24} className="mb-2 opacity-40" />
              <p className="text-sm">{t("manage.search_tmdb_hint")}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Metadata Detail Modal ───────────────────────────────── */}
      <Modal
        open={detailMovie !== null}
        onClose={() => setDetailMovie(null)}
        title={detailMovie?.title || ""}
        description={detailMovie?.year ? `${detailMovie.year}${detailMovie.genre ? ` · ${detailMovie.genre}` : ""}${detailMovie.runtime ? ` · ${detailMovie.runtime} min` : ""}` : ""}
      >
        {detailMovie && (
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="w-[100px] h-[140px] shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center"
                style={{ border: "1px solid var(--border-subtle)" }}>
                {detailMovie.poster_url ? (
                  <ProgressiveImage src={detailMovie.poster_url} alt={detailMovie.title} className="w-full h-full object-cover" />
                ) : (
                  <Film size={28} className="text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {detailMovie.overview ? (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.overview")}</p>
                    <p className="text-sm leading-relaxed line-clamp-4">{detailMovie.overview}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">{t("detail_modal.no_overview")}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {detailMovie.director && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.director")}</p>
                  <p className="text-sm">{detailMovie.director}</p>
                </div>
              )}
              {detailMovie.actors && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.actors")}</p>
                  <p className="text-sm line-clamp-2">{detailMovie.actors}</p>
                </div>
              )}
              {detailMovie.country && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.country")}</p>
                  <p className="text-sm">{detailMovie.country}</p>
                </div>
              )}
              {detailMovie.awards && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.awards")}</p>
                  <p className="text-sm line-clamp-2">{detailMovie.awards}</p>
                </div>
              )}
              {detailMovie.runtime && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.runtime")}</p>
                  <p className="text-sm">{detailMovie.runtime} {t("detail_modal.minutes")}</p>
                </div>
              )}
              {detailMovie.tagline && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.tagline")}</p>
                  <p className="text-sm italic">"{detailMovie.tagline}"</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {detailMovie.imdb_id && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 8.5h2v7h-2zm5.5 0h2v7h-2zm5.5-3.5h2v10.5h-2zM4 5.5h2v11H4z"/></svg>
                  {detailMovie.imdb_id}
                </Badge>
              )}
              {detailMovie.tmdb_id && (
                <Badge variant="outline" className="text-[10px]">TMDB: {detailMovie.tmdb_id}</Badge>
              )}
              {detailMovie.poster_url ? (
                <Badge variant="outline" className="text-[10px] text-green gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>
                  {t("manage.metadata_complete")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-amber gap-1">
                  <Sparkles size={10} />
                  {t("manage.enrich_hint")}
                </Badge>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Manual Search & Match Modal ─────────────────────────── */}
      <Modal
        open={rematchMovie !== null}
        onClose={() => setRematchMovie(null)}
        title={t("manage.rematch_title")}
        description={rematchMovie ? t("manage.rematch_desc", { title: rematchMovie.title }) : ""}
      >
        {rematchMovie && (
          <div className="space-y-4">
            {/* Current movie info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="w-9 h-14 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center"
                style={{ border: "1px solid var(--border-subtle)" }}>
                {rematchMovie.poster_url ? (
                  <img src={rematchMovie.poster_url} alt={rematchMovie.title} className="w-full h-full object-cover" />
                ) : (
                  <Film size={14} className="text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{rematchMovie.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  {rematchMovie.year && <span>{rematchMovie.year}</span>}
                  {rematchMovie.genre && <span className="truncate">{rematchMovie.genre}</span>}
                  {rematchMovie.scrape_error && (
                    <span className="text-destructive">
                      <AlertCircle size={10} className="inline mr-0.5" />
                      {t("manage.rematch_error")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Search input */}
            <input
              type="text"
              placeholder={t("manage.search_tmdb_placeholder")}
              value={rematchQuery}
              onChange={(e) => handleRematchQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRematchSearch(rematchQuery); }}
              className="input-field w-full"
              autoFocus
            />

            {/* Loading */}
            {rematchLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 size={20} className="animate-spin mr-2" />
                <span className="text-sm">{t("manage.searching")}</span>
              </div>
            )}

            {/* No results */}
            {!rematchLoading && rematchQuery && rematchResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Search size={24} className="mb-2 opacity-40" />
                <p className="text-sm">{t("manage.no_search_results", { query: rematchQuery })}</p>
              </div>
            )}

            {/* Results */}
            {!rematchLoading && rematchResults.length > 0 && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {rematchResults.map((result, idx) => {
                  const isCurrentMatch =
                    result.source_id === rematchMovie.tmdb_id ||
                    result.source_id === rematchMovie.imdb_id;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all card-lift cursor-pointer ${
                        isCurrentMatch
                          ? "border-green/40 bg-green/[0.04]"
                          : "border-border hover:border-primary/30 hover:bg-accent/20"
                      }`}
                      onClick={() => handleSelectRematch(result)}
                    >
                      <div className="w-10 h-14 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center"
                        style={{ border: "1px solid var(--border-subtle)" }}>
                        {result.poster_url ? (
                          <img src={result.poster_url} alt={result.title} className="w-full h-full object-cover" loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <Film size={14} className="text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{result.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {result.year && <span className="text-xs text-muted-foreground">{result.year}</span>}
                          {result.genre && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground truncate">{result.genre}</span>}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{result.source.toUpperCase()}</Badge>
                      {isCurrentMatch ? (
                        <span className="text-xs text-green font-medium shrink-0 whitespace-nowrap">{t("manage.rematch_current")}</span>
                      ) : (
                        <button
                          className="btn btn-xs shrink-0 gap-1"
                          onClick={(e) => { e.stopPropagation(); handleSelectRematch(result); }}
                        >
                          <Check size={12} />
                          {t("manage.rematch_select")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Genre Edit Dialog ──────────────────────────────────── */}
      <Modal
        open={genreDialogMovie !== null}
        onClose={() => setGenreDialogMovie(null)}
        title={t("manage.genre_edit_title")}
        description={genreDialogMovie ? t("manage.genre_edit_desc", { title: genreDialogMovie.title }) : ""}
        footer={
          <div className="flex items-center gap-2 w-full justify-end">
            <button className="btn btn-ghost btn-sm" onClick={() => setGenreDialogMovie(null)}>{t("common.cancel")}</button>
            <button className="btn btn-primary btn-sm" onClick={saveGenreDialog}>{t("common.save")}</button>
          </div>
        }
      >
        {genreDialogMovie && (
          <div className="py-2">
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0">🎬</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{genreDialogMovie.title}</p>
                <p className="text-xs text-muted-foreground">
                  {genreDialogMovie.year ? `${genreDialogMovie.year} · ` : ""}
                  {t("manage.genre_current", { genre: genreDialogMovie.genre || t("manage.genre_not_set") })}
                </p>
              </div>
            </div>
            <GenreInput
              value={genreDialogValue}
              onChange={setGenreDialogValue}
              placeholder={t("genre_input.placeholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); saveGenreDialog(); }
                if (e.key === "Escape") setGenreDialogMovie(null);
              }}
            />
          </div>
        )}
      </Modal>
    </section>
  );
}
