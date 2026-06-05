import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail, MediaSearchResult } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { useEnrich } from "../../context/EnrichContext";
import { Badge } from "../ui/badge";
import { Pagination } from "../Pagination";
import { SkeletonTable } from "../Skeleton";
import { Modal } from "../Modal";
import { Film, Upload, Plus, Search, Sparkles, Loader2, RefreshCw, Trash2, WandSparkles, AlertCircle, Star, X } from "lucide-react";

import { SearchImportModal } from "./SearchImportModal";
import { DetailModal } from "./DetailModal";
import { RematchModal } from "./RematchModal";
import { MarkWatchedModal } from "./MarkWatchedModal";
import { GenreEditModal } from "./GenreEditModal";

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

  const [mediaList, setMediaList] = useState<MediaDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [errorFilter, setErrorFilter] = useState(false);
  const [mediaTypeFilter, setMediaTypeFilter] = useState("");
  const [sort, setSort] = useState<SortConfig>({ field: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [editingCell, setEditingCell] = useState<{ movieId: number; field: string } | null>(null);
  const [sliderValue, setSliderValue] = useState(7);
  const [justSavedIds, setJustSavedIds] = useState<Set<number>>(new Set());
  const [genreDialogMovie, setGenreDialogMovie] = useState<MediaDetail | null>(null);
  const [genreDialogValue, setGenreDialogValue] = useState("");
  const [markWatchedMovie, setMarkWatchedMovie] = useState<MediaDetail | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Delete confirmation modal ───────────────────────────────── */
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteAction>(null);

  /* ── TMDB search & import ────────────────────────────────────── */
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  /* ── Metadata detail modal ───────────────────────────────────── */
  const [detailMovie, setDetailMovie] = useState<MediaDetail | null>(null);

  /* ── Manual search & match modal ─────────────────────────────── */
  const [rematchMovie, setRematchMovie] = useState<MediaDetail | null>(null);

  /* ── Enriching IDs ───────────────────────────────────────────── */
  const [enrichingIds, setEnrichingIds] = useState<Set<number>>(new Set());

  const loadMovies = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listMedia({
        search,
        page,
        page_size: MANAGE_PAGE_SIZE,
        status: statusFilter || undefined,
        sort_field: sort.field,
        sort_dir: sort.dir,
        has_error: errorFilter || undefined,
        media_type: mediaTypeFilter || undefined,
      });
      setMediaList(data.media);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, page, statusFilter, mediaTypeFilter, errorFilter, sort]);

  // Quiet refresh — fetches data without showing loading skeleton (for post-edit refresh)
  const refreshData = useCallback(async () => {
    setError("");
    try {
      const data = await api.listMedia({
        search,
        page,
        page_size: MANAGE_PAGE_SIZE,
        status: statusFilter || undefined,
        sort_field: sort.field,
        sort_dir: sort.dir,
        has_error: errorFilter || undefined,
        media_type: mediaTypeFilter || undefined,
      });
      setMediaList(data.media);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    }    }, [search, page, statusFilter, mediaTypeFilter, errorFilter, sort]);

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
      refreshData();
    } catch (err: any) {
      showToast(t("manage.delete_failed", { message: err.message }), "error");
    }
  }, [deleteConfirm, selected, refreshData, showToast, t]);

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
      // Show saved confirmation animation for rating edits
      if (field === "rating") {
        setJustSavedIds((prev) => new Set(prev).add(movieId));
        setTimeout(() => {
          setJustSavedIds((prev) => { const next = new Set(prev); next.delete(movieId); return next; });
        }, 1500);
      }
      showToast(t("manage.updated"), "success");
      cancelInlineEdit();
      refreshData();
    } catch (err: any) { showToast(t("manage.save_failed", { message: err.message }), "error"); cancelInlineEdit(); }
  }, [mediaList, refreshData, showToast, cancelInlineEdit, t]);

  /* ── Enrich operations ───────────────────────────────────────── */
  const openSearchDialog = useCallback(() => { setSearchDialogOpen(true); }, []);

  const handleEnrich = useCallback(async (movieId: number) => {
    setEnrichingIds(prev => new Set(prev).add(movieId));
    try {
      const updated = await api.enrichMedia(movieId);
      // Update poster/metadata immediately
      setMediaList(prev => prev.map(m => m.id === movieId ? { ...m, ...updated } : m));
      showToast(t("manage.enrich_success"), "success");
      refreshData();
    } catch (err: any) { showToast(t("manage.enrich_failed", { message: err.message }), "error"); }
    finally { setEnrichingIds(prev => { const next = new Set(prev); next.delete(movieId); return next; }); }
  }, [refreshData, showToast, t]);

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

  const handleExportMovies = useCallback(() => {
    if (mediaList.length === 0) return;
    const data = JSON.stringify({ movies: mediaList, exported_at: new Date().toISOString(), total }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xplore-movies-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [mediaList, total]);

  /* ── Pagination helpers ──────────────────────────────────────── */
  const totalPages = Math.ceil(total / MANAGE_PAGE_SIZE);

  const SortArrow = ({ field }: { field: SortField }) => (
    <span className="text-[11px] ml-1 transition-opacity" style={{ opacity: sort.field === field ? 1 : 0.25 }}>
      {sort.field === field ? (sort.dir === "asc" ? "↑" : "↓") : "↓"}
    </span>
  );

  const renderEditableCell = (movie: MediaDetail, field: string, display: React.ReactNode) => {
    const isEditing = editingCell?.movieId === movie.id && editingCell?.field === field;
    if (isEditing) {
      if (field === "rating") {
        const save = () => { saveInlineEdit(movie.id, "rating", sliderValue.toFixed(1)); };
        return (
          <td className="px-3 py-2 border-b border-border">
            <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input type="range" min={0} max={10} step={0.5} value={sliderValue}
                onChange={(e) => { setSliderValue(parseFloat(e.target.value)); navigator.vibrate?.(3); }}
                onMouseUp={save} onTouchEnd={save}
                onBlur={() => { if (editingCell?.movieId === movie.id) save(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") cancelInlineEdit(); }}
                className="w-20 h-1 sm:h-1 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer touch-manipulation
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                  max-sm:[&::-webkit-slider-thumb]:w-6 max-sm:[&::-webkit-slider-thumb]:h-6
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
                  [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out
                  active:[&::-webkit-slider-thumb]:scale-125
                  max-sm:h-2"
                autoFocus
              />
              <span className="text-amber font-medium text-xs min-w-[24px] text-center count-badge" key={sliderValue}>
                {sliderValue.toFixed(1)}
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
      const save = () => { const v = editInputRef.current?.value || ""; saveInlineEdit(movie.id, field, v); };
      return (
        <td className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1">
            <input ref={editInputRef} type={inputType} className={`no-spinner ${widthClass} input-field h-7 text-sm px-1.5 py-0.5`}
              defaultValue={value}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") cancelInlineEdit(); }}
              onBlur={() => { if (editingCell?.movieId === movie.id && editingCell?.field === field) save(); }}
              onClick={(e) => e.stopPropagation()} autoFocus />
          </div>
        </td>
      );
    }
    return (
      <td className="px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-accent/30 group"
        onClick={() => startInlineEdit(movie.id, field)} title={t("common.edit")}>
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-5">
        <h2 className="section-title flex items-center gap-2 text-base">
          <Film size={16} className="text-primary shrink-0" />
          <span className="truncate">{t("manage.title")}</span>
          <span className="badge font-mono text-xs shrink-0">{t("manage.total", { count: total })}</span>
        </h2>
        <div className="flex gap-1.5 items-center flex-wrap w-full sm:w-auto">
          <button className="btn btn-ghost btn-xs sm:py-1.5 sm:px-3 sm:text-sm" onClick={loadMovies} title={t("manage.refresh")}>
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
        <div className="relative flex-1">
          <input type="text" placeholder={t("manage.search_placeholder")} value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="input-field pl-3 pr-8 py-2 h-auto text-sm" />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setSearchInput(""); setSearch(""); setPage(0); }}><X size={14} /></button>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0 w-full sm:w-auto">
          <button className={`btn btn-xs gap-1.5 transition-all flex-1 sm:flex-none justify-center ${selected.size > 0 ? "btn-destructive" : "btn-ghost opacity-50"}`}
            disabled={selected.size === 0} onClick={confirmDeleteSelected}
            title={selected.size > 0 ? t("manage.delete_selected") : undefined}>
            <Trash2 size={12} /><span className="sm:hidden">{t("manage.delete")}</span><span className="hidden sm:inline">{t("manage.delete_selected")}</span>
            {selected.size > 0 && <span className="tabular-nums font-mono">{selected.size}</span>}
          </button>
          <button className="btn btn-ghost btn-xs gap-1.5 flex-1 sm:flex-none justify-center" onClick={confirmDeleteAll} title={t("manage.clear_all")}>
            <Trash2 size={12} /><span className="hidden sm:inline">{t("manage.clear_all")}</span>
          </button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto sm:flex-wrap pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        <span className="text-xs text-muted-foreground mr-1">{t("manage.filter")}</span>
        {[{ value: "", label: t("manage.filter_all") }, { value: "watched", label: t("manage.filter_watched") }, { value: "wish", label: t("manage.filter_wish") }].map((opt) => (
          <button key={opt.value} className={`pill ${statusFilter === opt.value ? "active" : ""}`}
            onClick={() => { setStatusFilter(opt.value); setErrorFilter(false); setPage(0); setSelected(new Set()); }}>{opt.label}</button>
        ))}
        <span className="w-[1px] h-3.5 bg-border mx-0.5" />
        <button className={`pill ${errorFilter ? "active text-destructive border-destructive/30" : ""}`}
          onClick={() => { setErrorFilter(!errorFilter); setStatusFilter(""); setPage(0); setSelected(new Set()); }}>
          <AlertCircle size={11} className="mr-1" />{t("manage.filter_errors")}
        </button>
      </div>

      {/* Media Type Filter */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto sm:flex-wrap pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        <span className="text-xs text-muted-foreground mr-1">{t("manage.media_type")}</span>
        {[{ value: "", label: t("manage.media_type_all") }, { value: "movie", label: t("manage.media_type_movie") }, { value: "tv", label: t("manage.media_type_tv") }].map((opt) => (
          <button key={opt.value} className={`pill ${mediaTypeFilter === opt.value ? "active" : ""}`}
            onClick={() => { setMediaTypeFilter(opt.value); setPage(0); setSelected(new Set()); }}>{opt.label}</button>
        ))}
      </div>

      {/* ── Sort bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3.5 overflow-x-auto sm:flex-wrap pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        <span className="text-xs text-muted-foreground mr-1">{t("manage.sort")}</span>
        {([{ field: "created_at" as SortField, label: t("manage.sort_import_time") },
          { field: "title" as SortField, label: t("manage.sort_title") },
          { field: "rating" as SortField, label: t("manage.sort_rating") },
          { field: "year" as SortField, label: t("manage.sort_year") }]).map((s) => (
          <button key={s.field} className={`pill ${sort.field === s.field ? "active" : ""}`}
            onClick={() => handleSort(s.field)}>{s.label} <SortArrow field={s.field} /></button>
        ))}
      </div>

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && <SkeletonTable rows={6} />}

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center"><X size={20} className="text-destructive" /></div>
          <p className="text-sm font-medium text-destructive">{t("manage.load_failed", { message: error })}</p>
          <button className="btn btn-ghost btn-xs gap-1.5" onClick={loadMovies}><RefreshCw size={12} />{t("manage.retry")}</button>
        </div>
      )}

      {/* ── Empty ──────────────────────────────────────────────── */}
      {!loading && !error && mediaList.length === 0 && (
        <div className="empty-state">
          <Film size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">{search ? t("manage.no_matching", { query: search }) : t("manage.no_movies")}</p>
          {search && <p className="text-xs mt-1 text-muted-foreground">{t("manage.try_other")}</p>}
          {!search && <button className="btn btn-primary btn-sm mt-4 gap-1.5" onClick={openSearchDialog}><Plus size={13} />{t("manage.add_movie")}</button>}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      {!loading && !error && mediaList.length > 0 && (
        <>
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="w-10 text-center px-3 py-2.5 font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">
                    <input type="checkbox" ref={selectAllRef} className="w-4 h-4 accent-primary cursor-pointer"
                      checked={mediaList.length > 0 && mediaList.every((m) => selected.has(m.id))} onChange={toggleSelectAll} />
                  </th>
                  <th className="w-[52px] px-1 py-2.5 text-center font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_poster")}</th>
                  <th className="w-14 px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_status")}</th>
                  {(["title", "rating", "year", "genre", "created_at"] as const).map((field) => {
                    const widths: Record<string, number | undefined> = { title: 200, rating: 140, year: 72, genre: undefined, created_at: 100 };
                    return (
                      <th key={field} className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none cursor-pointer hover:text-foreground transition-colors"
                        style={widths[field] ? { width: widths[field] } : undefined} onClick={() => handleSort(field)}>
                        {field === "title" ? t("manage.col_title") : field === "rating" ? t("manage.col_rating") : field === "year" ? t("manage.col_year") : field === "genre" ? t("manage.col_genre") : t("manage.col_date")}
                        <SortArrow field={field} />
                      </th>
                    );
                  })}
                  <th className="w-[120px] text-center px-1 py-2.5 font-medium text-xs text-muted-foreground bg-[var(--bg-canvas)] border-b border-border select-none">{t("manage.col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {mediaList.map((m) => (
                  <tr key={m.id} className={`transition-colors ${selected.has(m.id) ? "bg-primary/[0.04]" : "hover:bg-accent/20"}`}>
                    <td className="px-3 py-2 border-b border-border text-center">
                      <input type="checkbox" className="w-4 h-4 accent-primary cursor-pointer" checked={selected.has(m.id)} onChange={() => toggleSelection(m.id)} />
                    </td>
                    <td className="px-1 py-2 border-b border-border text-center">
                      <div className="relative w-[38px] h-[52px] rounded overflow-hidden bg-muted flex items-center justify-center mx-auto"
                        style={{ border: "1px solid var(--border-subtle)" }}>
                        {m.poster_url ? (
                          <img src={m.poster_url} alt={m.title} className="w-full h-full object-cover" loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : null}
                        <Film size={14} className={`text-muted-foreground/30 ${m.poster_url ? "hidden" : ""}`} />
                        {m.scrape_error && !m.poster_url && (
                          <div className="absolute bottom-0.5 right-0.5 group">
                            <AlertCircle size={12} className="text-destructive cursor-help" />
                            <div className="absolute bottom-full right-0 mb-1.5 w-56 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] leading-relaxed shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                              <span className="font-semibold">{t("manage.scrape_error_label")}</span><br />{m.scrape_error}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b border-border">
                      <div className="flex items-center gap-1.5">
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
                      </div>
                    </td>
                    {renderEditableCell(m, "title", 
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium truncate">{m.title}</span>
                        {m.media_type === "tv" && (
                          <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
                        )}
                        {m.season_number != null && (
                          <Badge variant="outline" className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5 shrink-0">
                            S{m.season_number}
                            {m.episode_count != null && <span className="ml-0.5 opacity-70">· {m.episode_count}ep</span>}
                          </Badge>
                        )}
                      </div>
                    )}
                    {renderEditableCell(m, "rating", (
                      <span className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${justSavedIds.has(m.id) ? 'saved-confirm' : ''}`} style={{ color: justSavedIds.has(m.id) ? 'var(--success)' : 'var(--fg-secondary)' }}>
                        <Star size={12} fill="currentColor" />
                        {justSavedIds.has(m.id) ? '✓ ' : ''}{m.rating.toFixed(1)}
                      </span>
                    ))}
                    {renderEditableCell(m, "year", <span className="text-muted-foreground">{m.year || "—"}</span>)}
                    {renderEditableCell(m, "genre", <span className="text-muted-foreground truncate block">{m.genre || "—"}</span>)}
                    {renderEditableCell(m, "created_at", <span className="text-muted-foreground text-xs">{m.created_at ? m.created_at.slice(0, 10) : "—"}</span>)}
                    <td className="px-1 py-2 border-b border-border text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--seed-radius)", padding: "1px" }}>
                        {m.status === "wish" && (
                          <button className="text-muted-foreground hover:text-green px-1.5 py-1 rounded transition-colors hover:bg-green/10"
                            onClick={() => { setMarkWatchedMovie(m); }} title={t("wishlist.mark_as_watched")}>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                        )}
                        <button className="text-muted-foreground hover:text-sky px-1.5 py-1 rounded transition-colors hover:bg-sky/10"
                          onClick={() => setDetailMovie(m)} title={t("manage.detail")}><InfoIcon size={14} /></button>
                        <button className="text-muted-foreground hover:text-foreground px-1.5 py-1 rounded transition-colors hover:bg-accent"
                          onClick={() => startInlineEdit(m.id, "title")} title={t("common.edit")}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button className={`px-1.5 py-1 rounded transition-colors ${m.scrape_error ? "text-amber" : "text-muted-foreground"} hover:text-sky hover:bg-sky/10`}
                          onClick={() => setRematchMovie(m)} title={m.scrape_error ? t("manage.rematch_error_hint") : t("manage.rematch")}>
                          <Search size={14} />
                        </button>
                        <button className={`px-1.5 py-1 rounded transition-colors ${enrichingIds.has(m.id) ? "text-primary animate-pulse" : "text-muted-foreground hover:text-amber"} hover:bg-amber/10`}
                          onClick={() => handleEnrich(m.id)} disabled={enrichingIds.has(m.id)}
                          title={enrichingIds.has(m.id) ? t("manage.enriching") : t("manage.enrich")}>
                          {enrichingIds.has(m.id) ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        </button>
                        <button className="text-muted-foreground hover:text-destructive px-1.5 py-1 rounded transition-colors hover:bg-destructive/10"
                          onClick={() => confirmDelete(m.id, m.title)} title={t("common.delete")}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={page} totalPages={totalPages}
            onPageChange={(p) => { setPage(p); setSelected(new Set()); }}
            info={`${t("pagination.page_info", { start: page * MANAGE_PAGE_SIZE + 1, end: Math.min((page + 1) * MANAGE_PAGE_SIZE, total) })} / ${t("manage.total", { count: total })}`}
          />
        </>
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
      <SearchImportModal open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} onImportComplete={() => { setSearchDialogOpen(false); refreshData(); }} />

      {/* ── Metadata Detail Modal ───────────────────────────────── */}
      <DetailModal open={detailMovie !== null} movie={detailMovie} onClose={() => setDetailMovie(null)} />

      {/* ── Manual Search & Match Modal ─────────────────────────── */}
      <RematchModal open={rematchMovie !== null} movie={rematchMovie} onClose={() => setRematchMovie(null)} onSuccess={() => { setRematchMovie(null); refreshData(); }} />

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
            refreshData();
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
            refreshData();
          } catch (err: any) { showToast(t("manage.save_failed", { message: err.message }), "error"); }
        }}
      />
    </section>
  );
}

/* ── Inline info icon (no lucide import needed) ───────────────── */
function InfoIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}
