import { useState, useCallback, useRef, useEffect, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import type { WishlistItem, MediaSearchResult, ExternalDetail, SortField } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { useEnrich } from "../../context/EnrichContext";
import { Badge } from "../ui/badge";
import { translateGenres } from "../../utils/genre";
import { Separator } from "../ui/separator";
import { Pagination } from "../Pagination";
import { GenreInput } from "../GenreInput";
import { ProgressiveImage } from "../ProgressiveImage";
import { DetailModal } from "../ManageTab/DetailModal";
import { Film, ChevronRight, Loader2, ChevronDown } from "lucide-react";
import { MediaTypeFilter } from "../MediaTypeFilter";
import { SortControls } from "../SortControls";
import { SearchInput } from "../SearchInput";
import { SearchSourceSelector } from "../SearchSourceSelector";
import { Modal } from "../Modal";
import { useDebouncedSearch } from "../../hooks/useDebouncedSearch";
import { usePagination } from "../../hooks/usePagination";
import { useSort } from "../../hooks/useSort";
import { useEnrichReload } from "../../hooks/useEnrichReload";

import { EmptyState } from "../EmptyState";
import { WishlistDetailModal } from "./DetailModal";
import { WishlistRatingModal } from "./RatingModal";

interface WishlistEntry {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  media_type?: string;
  season_number?: number | null;
  episode_count?: number | null;
  poster_url?: string | null;
  overview?: string | null;
  director?: string | null;
  actors?: string | null;
  runtime?: number | null;
  imdb_id?: string | null;
  tmdb_id?: string | null;
  country?: string | null;
  awards?: string | null;
  tagline?: string | null;
  series_poster_url?: string | null;
}

const PAGE_SIZE = 16;

export function WishlistTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();

  // ── Wishlist data ──
  const [items, setItems] = useState<WishlistEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [filtersExpanded, setFiltersExpanded] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640);
  const [loading, setLoading] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const filter = useDebouncedSearch("", 300);
  const { field: sortField, dir: sortDir, toggle: handleSortToggle } = useSort("created_at", "desc");
  const { page: currentPage, setPage: setCurrentPage, totalPages } = usePagination(total, PAGE_SIZE);

  // === External search (TMDB / OMDb) ===
  const [externalQuery, setExternalQuery] = useState("");
  const [searchSource, setSearchSource] = useState("auto");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchDone, setSearchDone] = useState(false);

  const searchSourceRef = useRef(searchSource);
  searchSourceRef.current = searchSource;
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  // === Manual add ===
  const [newTitle, setNewTitle] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newGenre, setNewGenre] = useState("");

  // === JSON import ===
  const [jsonText, setJsonText] = useState("");

  // === Mark-as-watched modal ===
  const [markingMovie, setMarkingMovie] = useState<WishlistEntry | null>(null);

  // === Search results sort & filter ===
  const [searchSortField, setSearchSortField] = useState<"year" | "title">("year");
  const [searchSortDir, setSearchSortDir] = useState<"asc" | "desc">("desc");
  const [searchSourceFilter, setSearchSourceFilter] = useState<string>("");

  // === External search detail modal ===
  const [detailMovie, setDetailMovie] = useState<MediaSearchResult | null>(null);
  const [detailData, setDetailData] = useState<ExternalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // === Modals ===
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // === Saved item detail modal ===
  const [detailSaved, setDetailSaved] = useState<WishlistEntry | null>(null);

  // ── Load wishlist from API ──

  const loadWishlist = useCallback(async (page: number, search: string, sortF: string, sortD: string, mediaType: string, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await api.listMedia({
        page,
        page_size: PAGE_SIZE,
        status: "wish",
        search: search || undefined,
        sort_field: sortF,
        sort_dir: sortD,
        media_type: (mediaType !== "all" ? mediaType : undefined),
        signal,
      });
      if (signal?.aborted) return;
      setItems(data.media.map((m) => ({ id: m.id, title: m.title, year: m.year, genre: m.genre, media_type: m.media_type, poster_url: m.poster_url, overview: m.overview, director: m.director, actors: m.actors, runtime: m.runtime, imdb_id: m.imdb_id, tmdb_id: m.tmdb_id, country: m.country, awards: m.awards, tagline: m.tagline, series_poster_url: m.series_poster_url, season_number: m.season_number, episode_count: m.episode_count })));
      setTotal(data.total);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }
    finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadWishlist(currentPage, filter.debouncedValue, sortField, sortDir, mediaTypeFilter, controller.signal);
    return () => controller.abort();
  }, [currentPage, filter.debouncedValue, sortField, sortDir, mediaTypeFilter, reloadTrigger, loadWishlist]);



  // Auto-refresh when background enrichment completes
  useEnrichReload(() => setReloadTrigger((n) => n + 1));

  const refreshWishlist = useCallback(() => { setCurrentPage(0); filter.clear(); setReloadTrigger((n) => n + 1); }, []);

  // ── Search results sort (memoised to avoid re-filter/sort on every render) ──

  const sortedResults = useMemo(() => {
    return [...searchResults]
      .filter((r) => !searchSourceFilter || r.source === searchSourceFilter)
      .sort((a, b) => {
        let va: any, vb: any;
        if (searchSortField === "year") {
          va = a.year ?? (searchSortDir === "asc" ? Infinity : -Infinity);
          vb = b.year ?? (searchSortDir === "asc" ? Infinity : -Infinity);
        } else {
          va = (a.title || "").toLowerCase();
          vb = (b.title || "").toLowerCase();
        }
        if (va < vb) return searchSortDir === "asc" ? -1 : 1;
        if (va > vb) return searchSortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [searchResults, searchSourceFilter, searchSortField, searchSortDir]);

  const toggleSearchSort = useCallback((field: "year" | "title") => {
    setSearchSortField((prev) => {
      if (prev === field) { setSearchSortDir((d) => (d === "asc" ? "desc" : "asc")); return prev; }
      setSearchSortDir("desc");
      return field;
    });
  }, []);

  // ================================
  // External search
  // ================================

  const handleSearch = useCallback(async () => {
    const q = externalQuery;
    if (!q.trim()) { setSearchResults([]); setSearchError(""); setSearchDone(false); return; }
    setSearchLoading(true);
    setSearchError("");
    try {
      const data = await api.searchMedia(q.trim(), searchSourceRef.current);
      setSearchResults(data.results);
      setSearchDone(true);
    } catch (err: any) { setSearchError(err.message); setSearchResults([]); setSearchDone(true); }
    finally { setSearchLoading(false); }
  }, [externalQuery]);

  const changeSearchSource = useCallback((source: string) => {
    setSearchSource(source);
  }, []);

  const openDetail = useCallback(async (result: MediaSearchResult) => {
    setDetailMovie(result);
    setDetailData(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const data = await api.getExternalDetail(result.source, result.source_id);
      setDetailData(data);
    } catch (err: any) { setDetailError(err.message); }
    finally { setDetailLoading(false); }
  }, []);

  const closeDetail = useCallback(() => { setDetailMovie(null); setDetailData(null); setDetailError(""); }, []);

  const addSearchResultToWishlist = useCallback(async (result: MediaSearchResult) => {
    const key = `${result.source}:${result.source_id}`;
    if (addingIds.has(key)) return;
    setAddingIds((prev) => new Set(prev).add(key));
    try {
      await api.addToWishlist({ title: result.title, year: result.year, genre: result.genre || null });
      showToast(t("wishlist.added_to_wishlist", { title: result.title }), "success");
      startPolling();
      refreshWishlist();
    } catch (err: any) { showToast(t("wishlist.add_failed", { message: err.message }), "error"); }
    finally { setAddingIds((prev) => { const next = new Set(prev); next.delete(key); return next; }); }
  }, [addingIds, showToast, startPolling, refreshWishlist, t]);

  // ================================
  // Manual add
  // ================================

  const addMovie = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) { showToast(t("wishlist.enter_title"), "error"); return; }
    const year = newYear.trim() ? parseInt(newYear.trim()) : null;
    try {
      await api.addToWishlist({ title, year, genre: newGenre || null });
      setNewTitle(""); setNewYear(""); setNewGenre("");
      showToast(t("wishlist.added_to_wishlist", { title }), "success");
      startPolling();
      refreshWishlist();
      setAddModalOpen(false);
    } catch (err: any) { showToast(t("wishlist.add_failed", { message: err.message }), "error"); }
  }, [newTitle, newYear, newGenre, showToast, startPolling, refreshWishlist, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addMovie(); } }, [addMovie]);

  // ================================
  // JSON import
  // ================================

  const handleImportJSON = useCallback(async () => {
    if (!jsonText.trim()) { showToast(t("wishlist.json_empty"), "error"); return; }
    try {
      const raw = JSON.parse(jsonText);
      const list = Array.isArray(raw) ? raw : raw.movies || raw.items || [];
      if (!Array.isArray(list) || list.length === 0) { showToast(t("wishlist.json_invalid"), "error"); return; }
      const parsedItems: WishlistItem[] = list
        .map((item: any) => ({ title: (item.title || item.name || "").trim(), year: item.year ?? null, genre: item.genre ?? null }))
        .filter((m) => m.title);
      if (parsedItems.length === 0) { showToast(t("wishlist.json_invalid"), "error"); return; }
      // Fetch ALL existing titles for dedup (not just current page)
      const existingTitles = await api.listMediaTitles();
      const existingSet = new Set(existingTitles.map((t) => t.toLowerCase()));
      const newItems = parsedItems.filter((m) => !existingSet.has(m.title.toLowerCase()));
      if (newItems.length === 0) { showToast(t("wishlist.json_all_exist"), "info"); return; }
      await api.importWishlist(newItems);
      showToast(t("wishlist.json_imported", { count: newItems.length }), "success");
      startPolling();
      refreshWishlist();
      setJsonText("");
      setAddModalOpen(false);
    } catch (err: any) { showToast(t("wishlist.json_parse_failed", { message: err.message }), "error"); }
  }, [jsonText, showToast, refreshWishlist, t, startPolling]);

  // ================================
  // Wishlist operations
  // ================================

  const deleteItem = useCallback(async (id: number) => {
    try {
      await api.deleteMedia(id);
      showToast(t("wishlist.delete_success"), "success");
      const willBeEmpty = items.length <= 1;
      if (willBeEmpty && currentPage > 0) setCurrentPage((p) => p - 1);
      else setReloadTrigger((n) => n + 1);
    } catch (err: any) { showToast(t("wishlist.delete_failed", { message: err.message }), "error"); }
  }, [items.length, currentPage, showToast, t]);

  const confirmMarkAsWatched = useCallback(async (movieId: number, rating: number) => {
    try {
      await api.markMediaAsWatched(movieId, rating);
      setMarkingMovie(null);
      showToast(t("wishlist.marked_as_watched", { title: items.find(m => m.id === movieId)?.title || "", rating: rating.toFixed(1) }), "success");
      const willBeEmpty = items.length <= 1;
      if (willBeEmpty && currentPage > 0) setCurrentPage((p) => p - 1);
      else setReloadTrigger((n) => n + 1);
    } catch (err: any) { showToast(t("wishlist.mark_failed", { message: err.message }), "error"); }
  }, [items, currentPage, showToast, t]);

  return (
    <div className="space-y-5">

      {/* === Wishlist Section === */}
      {(total > 0 || filter.debouncedValue || mediaTypeFilter !== "all" || loading) && (
        <section className="section-card animate-slide-down">
          <div className="section-header flex-wrap gap-2 sm:flex-nowrap">
            <h2 className="section-title flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              {t("wishlist.title")}
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setSearchModalOpen(true)}
                className="btn btn-ghost btn-xs shrink-0"
                title={t("wishlist.search_movies")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <span className="hidden sm:inline">{t("wishlist.search_movies")}</span>
              </button>
              <button
                onClick={() => setAddModalOpen(true)}
                className="btn btn-ghost btn-xs shrink-0"
                title={t("wishlist.manual_add")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span className="hidden sm:inline">{t("wishlist.manual_add")}</span>
              </button>
              <span className="badge font-mono text-xs">{t("wishlist.movie_count", { count: total })}</span>
            </div>
          </div>
          <SearchInput
            value={filter.input}
            onChange={filter.setInput}
            onClear={() => { filter.clear(); setMediaTypeFilter("all"); setCurrentPage(0); }}
            placeholder={t("wishlist.filter_placeholder")}
            showClear={!!filter.debouncedValue}
            className="mb-2"
            id="wishlist-filter"
          />
          {/* ── Filter toggle (mobile only) ──────────────── */}
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

          {/* ── Filters: collapsible on mobile ───────────── */}
          <div className={`sm:block ${filtersExpanded ? 'max-sm:block max-sm:animate-slide-down' : 'max-sm:hidden'}`}>
            <div className="flex flex-col gap-0 sm:gap-0">
              <div className="flex items-start sm:items-center gap-0 sm:gap-0 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar">
                <SortControls
                  field={sortField}
                  dir={sortDir}
                  onSort={(f) => { handleSortToggle(f); setCurrentPage(0); }}
                />
                <MediaTypeFilter
                  selected={mediaTypeFilter}
                  onSelect={(v) => { setMediaTypeFilter(v); setCurrentPage(0); }}
                />
              </div>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10"><div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" /></div>
          ) : (
            <>
                {items.length === 0 && (filter.debouncedValue || mediaTypeFilter !== "all") ? (
                  <EmptyState
                    hasActiveFilters
                    searchQuery={filter.debouncedValue}
                    onClearFilters={() => {
                      filter.clear();
                      setMediaTypeFilter("all");
                      setCurrentPage(0);
                    }}
                    noMatchKey={filter.debouncedValue ? "wishlist.no_matching" : "watched.no_match"}
                    noDataKey="wishlist.no_items"
                  />
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2.5">
                      {items.map((m) => (
                        <WishlistMobileCard
                          key={m.id}
                          item={m}
                          onMarkWatched={setMarkingMovie}
                          onDelete={deleteItem}
                          onOpenDetail={setDetailSaved}
                        />
                      ))}
                    </div>
                    {/* Desktop cards */}
                    <div className="max-sm:hidden space-y-1.5">
                      {items.map((m) => (
                        <div key={m.id} className="card card-lift p-3.5 flex items-center justify-between cursor-pointer group" onClick={() => setMarkingMovie(m)}>
                    <div className="flex items-center gap-3" style={{ cursor: m.poster_url ? 'pointer' : undefined }}
                      onClick={(e) => { e.stopPropagation(); setDetailSaved(m); }}>
                      <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
                        {m.poster_url ? <ProgressiveImage src={m.poster_url} alt={m.title} className="w-full h-full object-cover" /> : <Film size={14} style={{ color: "var(--fg-dim)" }} />}
                      </div>
                      <div>
                        <p className="text-sm font-[510]" style={{ color: "var(--seed-fg)" }}>{m.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {m.year && <span className="text-xs" style={{ color: "var(--fg-muted)" }}>{m.year}</span>}
                          {m.genre && <span className="badge text-xs">{translateGenres(m.genre)}</span>}
                          {m.media_type === "tv" && <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5">TV</Badge>}
                          {m.season_number != null && (
                            <Badge variant="outline" className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5">
                              S{m.season_number}
                              {m.episode_count != null && <span className="ml-0.5 opacity-70">· {m.episode_count}ep</span>}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="text-xs text-green hover:text-green/80 px-1.5 py-1 rounded transition-all opacity-0 group-hover:opacity-100 max-sm:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setMarkingMovie(m); }} title={t("wishlist.mark_as_watched")}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </button>
                      <button className="text-muted-foreground hover:text-destructive px-1 py-1 rounded transition-all opacity-0 group-hover:opacity-100 max-sm:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteItem(m.id); }} title={t("watched.remove")}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                      </button>
                      <ChevronRight size={14} style={{ color: "var(--fg-dim)" }} />
                    </div>
                  </div>
                ))}
              </div>
              </>)}
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} info={t("watched.total_movies", { count: total })} />
            </>
          )}
        </section>
      )}

      {/* === Search Modal === */}
      <Modal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        title={t("wishlist.search_movies")}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <SearchSourceSelector
              selected={searchSource}
              onSelect={changeSearchSource}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input type="text" id="wishlist-search" placeholder={t("wishlist.search_placeholder")}
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
              <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground mr-0.5">{t("manage.sort")}</span>
                {[{ field: "year" as const, label: t("manage.sort_year") }, { field: "title" as const, label: t("manage.sort_title") }].map((s) => (
                  <button key={s.field} className={`pill ${searchSortField === s.field ? "active" : ""}`} onClick={() => toggleSearchSort(s.field)}>
                    {s.label} <span className="text-[10px]">{searchSortField === s.field ? (searchSortDir === "asc" ? "↑" : "↓") : ""}</span>
                  </button>
                ))}
                <span className="w-[1px] h-3.5 bg-border mx-1" />
                <span className="text-[11px] text-muted-foreground mr-0.5">{t("manage.filter")}</span>
                {[{ value: "", label: t("search_source.auto") }, { value: "tmdb", label: t("search_source.tmdb") }, { value: "tvmaze", label: t("search_source.tvmaze") }].map((opt) => (
                  <button key={opt.value} className={`pill ${searchSourceFilter === opt.value ? "active" : ""}`} onClick={() => setSearchSourceFilter(opt.value)}>{opt.label}</button>
                ))}
              </div>
              {sortedResults.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground"><p className="text-xs">{t("manage.no_matching", { query: externalQuery })}</p></div>
              ) : (
                <div className="space-y-1.5">
                  {sortedResults.map((r, i) => {
                    const key = `${r.source}:${r.source_id}`;
                    const isAdding = addingIds.has(key);
                    const alreadyInList = items.some((m) => m.title.toLowerCase() === r.title.toLowerCase());
                    return (
                      <div key={`${key}-${i}`} className="card card-lift p-3 flex items-center gap-3 text-sm cursor-pointer" onClick={() => openDetail(r)}>
                        <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
                          {r.poster_url ? <ProgressiveImage src={r.poster_url} alt={r.title} className="w-full h-full object-cover" /> : <Film size={16} style={{ color: "var(--fg-dim)", opacity: 0.4 }} />}
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
                        <button className={`btn ${alreadyInList ? "btn-ghost" : ""} btn-xs shrink-0 transition-all`} disabled={isAdding || alreadyInList}
                          onClick={(e) => { e.stopPropagation(); addSearchResultToWishlist(r); }}>
                          {isAdding ? <span className="flex items-center gap-1"><div className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />{t("wishlist.adding")}</span>
                            : alreadyInList ? t("wishlist.already_added")
                            : <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>{t("wishlist.add")}</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {searchDone && searchResults.length === 0 && externalQuery.trim() && !searchLoading && !searchError && (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">{t("wishlist.search_empty", { query: externalQuery })}</p>
              <p className="text-xs mt-1">{t("wishlist.search_empty_hint")}</p>
            </div>
          )}
          {searchError && <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{searchError}</div>}
        </div>
      </Modal>

      {/* === Add Movie Modal === */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t("wishlist.manual_add_title")}
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <input type="text" id="wishlist-title" placeholder={t("wishlist.title_placeholder")} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={handleKeyDown} className="input-field w-full h-10 text-sm" />
            <div className="flex items-center gap-2">
              <input type="number" id="wishlist-year" placeholder={t("wishlist.year_placeholder")} value={newYear} onChange={(e) => setNewYear(e.target.value)} onKeyDown={handleKeyDown}
                className="input-field w-[80px] h-10 text-sm no-spinner shrink-0" />
              <div className="flex-1 min-w-0"><GenreInput value={newGenre} onChange={setNewGenre} placeholder={t("wishlist.genre_placeholder")} onKeyDown={handleKeyDown} /></div>
              <button className="btn btn-primary h-10 shrink-0" onClick={addMovie}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                {t("wishlist.add")}
              </button>
            </div>
          </div>
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center"><Separator /></div>
            <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">{t("wishlist.batch_import")}</span></div>
          </div>
          <div className="space-y-3">
            <textarea id="wishlist-json" value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder={t("wishlist.json_placeholder")}
              rows={3} className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground font-mono text-xs leading-relaxed resize-y min-h-[60px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground" />
            <button className="btn btn-ghost btn-sm w-full" onClick={handleImportJSON}>{t("wishlist.import_to_wishlist")}</button>
          </div>
        </div>
      </Modal>

      {/* === External Search Detail Modal === */}
      <WishlistDetailModal open={detailMovie !== null} movie={detailMovie} detailData={detailData} loading={detailLoading} error={detailError} onClose={closeDetail} />

      {/* === Saved Item Detail Modal === */}
      {detailSaved && (
        <DetailModal
          open={detailSaved !== null}
          movie={{
            id: detailSaved.id,
            title: detailSaved.title,
            rating: 0,
            year: detailSaved.year,
            genre: detailSaved.genre,
            status: "wish",
            media_type: detailSaved.media_type || "movie",
            poster_url: detailSaved.poster_url ?? null,
            overview: detailSaved.overview ?? null,
            director: detailSaved.director ?? null,
            actors: detailSaved.actors ?? null,
            runtime: detailSaved.runtime ?? null,
            imdb_id: detailSaved.imdb_id ?? null,
            tmdb_id: detailSaved.tmdb_id ?? null,
            country: detailSaved.country ?? null,
            awards: detailSaved.awards ?? null,
            tagline: detailSaved.tagline ?? null,
            scrape_error: null,
            tv_series_id: null,
            season_number: detailSaved.season_number ?? null,
            episode_count: detailSaved.episode_count ?? null,
            series_poster_url: detailSaved.series_poster_url ?? null,
            created_at: "",
          }}
          onClose={() => setDetailSaved(null)}
        />
      )}

      {/* === Rating Modal === */}
      <WishlistRatingModal open={markingMovie !== null} movie={markingMovie} onClose={() => setMarkingMovie(null)} onConfirm={confirmMarkAsWatched} />

      {/* Empty State (no items, no filters) */}
      {total === 0 && !filter.debouncedValue && mediaTypeFilter === "all" && !loading && (
        <section className="section-card">
          <EmptyState
            icon={
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            }
            noDataKey="wishlist.no_items"
            noDataSubtextKey="wishlist.no_items_hint"
            noDataActions={
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setSearchModalOpen(true)}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  {t("wishlist.search_movies")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddModalOpen(true)}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {t("wishlist.manual_add")}
                </button>
              </div>
            }
          />
        </section>
      )}
    </div>
  );
}

/* ── Memo-ized mobile card — compact card layout for small screens ── */
const WishlistMobileCard = memo(function WishlistMobileCard({ item, onMarkWatched, onDelete, onOpenDetail }: {
  item: WishlistEntry;
  onMarkWatched: (item: WishlistEntry) => void;
  onDelete: (id: number) => void;
  onOpenDetail: (item: WishlistEntry) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="p-3 rounded-xl transition-all duration-200"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}
    >
      {/* Row 1: Poster + Title/Meta */}
      <div className="flex items-start gap-2.5">
        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer"
          style={{ border: "1px solid var(--border-subtle)" }}
          onClick={() => onOpenDetail(item)}
        >
          {item.poster_url ? (
            <ProgressiveImage src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <Film size={16} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate" onClick={() => onOpenDetail(item)}>{item.title}</span>
                {item.media_type === "tv" && (
                  <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/80">
                {item.year && <span>{item.year}</span>}
                {item.genre && <span className="truncate">{translateGenres(item.genre)}</span>}
                {item.season_number != null && (
                  <Badge variant="outline" className="text-[9px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0">
                    S{item.season_number}{item.episode_count != null && <span className="ml-0.5 opacity-70">· {item.episode_count}ep</span>}
                  </Badge>
                )}
              </div>
            </div>
            <ChevronRight size={14} className="shrink-0 mt-0.5" style={{ color: "var(--fg-dim)" }} />
          </div>
        </div>
      </div>

      {/* Row 2: Action buttons */}
      <div className="flex items-center gap-1 mt-2.5 pt-2.5 overflow-x-auto no-scrollbar" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-green hover:bg-green/10 shrink-0"
          onClick={() => onMarkWatched(item)}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t("wishlist.mark_as_watched")}</span>
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-sky hover:bg-sky/10"
          onClick={() => onOpenDetail(item)}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
          <span>{t("manage.detail")}</span>
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
          onClick={() => onDelete(item.id)}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          <span>{t("watched.remove")}</span>
        </button>
      </div>
    </div>
  );
}, (prev, next) => {
  const id = prev.item.id;
  if (prev.item.title !== next.item.title) return false;
  if (prev.item.year !== next.item.year) return false;
  if (prev.item.genre !== next.item.genre) return false;
  if (prev.item.poster_url !== next.item.poster_url) return false;
  if (prev.item.media_type !== next.item.media_type) return false;
  if (prev.item.season_number !== next.item.season_number) return false;
  if (prev.item.episode_count !== next.item.episode_count) return false;
  return true;
});
