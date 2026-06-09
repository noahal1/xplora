import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import { Film, ChevronRight } from "lucide-react";
import { useDebouncedSearch } from "../../hooks/useDebouncedSearch";
import { usePagination } from "../../hooks/usePagination";
import { useSort } from "../../hooks/useSort";

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
}

const PAGE_SIZE = 30;

export function WishlistTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();

  // ── Wishlist data ──
  const [items, setItems] = useState<WishlistEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const search = useDebouncedSearch("", 300);
  const filter = useDebouncedSearch("", 300);
  const { field: sortField, dir: sortDir, toggle: handleSortToggle } = useSort("created_at", "desc");
  const { page: currentPage, setPage: setCurrentPage, totalPages } = usePagination(total, 30);

  // === External search (TMDB / OMDb) ===
  const [externalQuery, setExternalQuery] = useState("");
  const [searchSource, setSearchSource] = useState("auto");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchDone, setSearchDone] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // === Movie detail modal ===
  const [detailMovie, setDetailMovie] = useState<MediaSearchResult | null>(null);
  const [detailData, setDetailData] = useState<ExternalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

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
      setItems(data.media.map((m) => ({ id: m.id, title: m.title, year: m.year, genre: m.genre, media_type: m.media_type, season_number: m.season_number, episode_count: m.episode_count })));
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
    loadWishlist(currentPage, search.debouncedValue, sortField, sortDir, mediaTypeFilter, controller.signal);
    return () => controller.abort();
  }, [currentPage, search.debouncedValue, sortField, sortDir, mediaTypeFilter, reloadTrigger, loadWishlist]);

  // Clear debounce timeouts on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Auto-refresh when background enrichment completes
  useEffect(() => {
    const handler = () => setReloadTrigger((n) => n + 1);
    window.addEventListener("enrich-done", handler);
    return () => window.removeEventListener("enrich-done", handler);
  }, []);

  const refreshWishlist = useCallback(() => { setCurrentPage(0); search.clear(); setReloadTrigger((n) => n + 1); }, []);

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

  const handleSearch = useCallback((value: string) => {
    setExternalQuery(value);
    setSearchDone(false);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) { setSearchResults([]); setSearchError(""); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const data = await api.searchMedia(value.trim(), searchSourceRef.current);
        setSearchResults(data.results);
        setSearchDone(true);
      } catch (err: any) { setSearchError(err.message); setSearchResults([]); setSearchDone(true); }
      finally { setSearchLoading(false); }
    }, 350);
  }, []);

  const changeSearchSource = useCallback((source: string) => {
    setSearchSource(source);
    if (externalQuery.trim()) handleSearch(externalQuery);
  }, [externalQuery, handleSearch]);

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
      {/* === External Search Section === */}
      <section className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            {t("wishlist.search_movies")}
          </h2>
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)" }}>
            {[{ value: "auto", label: t("search_source.auto") }, { value: "tmdb", label: t("search_source.tmdb") }, { value: "tvmaze", label: t("search_source.tvmaze") }].map((opt) => (
              <button key={opt.value} className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${searchSource === opt.value ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => changeSearchSource(opt.value)}>{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <input type="text" id="wishlist-search" placeholder={t("wishlist.search_placeholder")}
            value={externalQuery} onChange={(e) => handleSearch(e.target.value)}
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

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-3 animate-slide-down">
            <p className="text-xs text-muted-foreground mb-2">{t("wishlist.search_results")}</p>
            <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground mr-0.5">{t("manage.sort")}</span>
              {[{ field: "year" as const, label: t("manage.sort_year") }, { field: "title" as const, label: t("manage.sort_title") }].map((s) => (
                <button key={s.field} className={`pill ${searchSortField === s.field ? "active" : ""}`} onClick={() => toggleSearchSort(s.field)}>
                  {s.label} <span className="text-[10px]">{searchSortField === s.field ? (searchSortDir === "asc" ? "↑" : "↓") : ""}</span>
                </button>
              ))}
              <span className="w-[1px] h-3.5 bg-border mx-1" />
              <span className="text-[11px] text-muted-foreground mr-0.5">{t("manage.filter")}</span>
              {[{ value: "", label: t("search_source.auto") }, { value: "tmdb", label: t("search_source.tmdb") }, { value: "omdb", label: t("search_source.omdb") }, { value: "tvmaze", label: t("search_source.tvmaze") }].map((opt) => (
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
                        {r.poster_url ? <ProgressiveImage src={r.poster_url} alt={r.title} className="w-full h-full object-cover" /> : <span className="opacity-40">🎬</span>}
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
          <div className="mt-4 text-center py-4 text-muted-foreground">
            <p className="text-sm">{t("wishlist.search_empty", { query: externalQuery })}</p>
            <p className="text-xs mt-1">{t("wishlist.search_empty_hint")}</p>
          </div>
        )}
        {searchError && <div className="mt-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{searchError}</div>}
      </section>

      {/* === Add Movie Section === */}
      <section className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {t("wishlist.manual_add")}
          </h2>
        </div>
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
        <div className="relative my-4"><div className="absolute inset-0 flex items-center"><Separator /></div><div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">{t("wishlist.batch_import")}</span></div></div>
        <div className="space-y-3">
          <textarea id="wishlist-json" value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder={t("wishlist.json_placeholder")}
            rows={3} className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground font-mono text-xs leading-relaxed resize-y min-h-[60px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground" />
          <button className="btn btn-ghost text-xs" onClick={handleImportJSON}>{t("wishlist.import_to_wishlist")}</button>
        </div>
      </section>

      {/* === Wishlist Section === */}
      {total > 0 && (
        <section className="section-card animate-slide-down">
          <div className="section-header">
            <h2 className="section-title flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              {t("wishlist.title")}
            </h2>
            <span className="badge font-mono text-xs">{t("wishlist.movie_count", { count: total })}</span>
          </div>
          <div className="relative flex-1 mb-2">
            <input type="text" id="wishlist-filter" placeholder={t("wishlist.filter_placeholder")} value={filter.input} onChange={(e) => filter.setInput(e.target.value)}
              className="input-field pl-3 pr-8 py-2 h-auto text-sm" />
            {filter.debouncedValue && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { filter.clear(); setMediaTypeFilter("all"); setCurrentPage(0); }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>}
          </div>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-0.5">{t("manage.sort")}</span>
            {[{ field: "created_at" as SortField, label: t("manage.sort_import_time") }, { field: "title" as SortField, label: t("manage.sort_title") }, { field: "rating" as SortField, label: t("manage.sort_rating") }, { field: "year" as SortField, label: t("manage.sort_year") }].map((opt) => (
              <button key={opt.field} className={`pill ${sortField === opt.field ? "active" : ""}`}
                onClick={() => { handleSortToggle(opt.field); setCurrentPage(0); }}>
                {opt.label} {sortField === opt.field && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
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
          {loading ? (
            <div className="flex items-center justify-center py-10"><div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" /></div>
          ) : (
            <>
              <div className="space-y-1.5">
                {items.length === 0 && filter.debouncedValue ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {mediaTypeFilter !== "all" ? t("manage.no_matching", { query: t(`manage.media_type_${mediaTypeFilter}`) }) : t("wishlist.no_matching", { query: filter.debouncedValue })}
                  </div>
                ) : items.map((m) => (
                  <div key={m.id} className="card card-lift p-3.5 flex items-center justify-between cursor-pointer group" onClick={() => setMarkingMovie(m)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-12 rounded shrink-0 flex items-center justify-center" style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>
                        <Film size={14} style={{ color: "var(--fg-dim)" }} />
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
                      <button className="text-xs text-green hover:text-green/80 px-1.5 py-1 rounded transition-all opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setMarkingMovie(m); }} title={t("wishlist.mark_as_watched")}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </button>
                      <button className="text-muted-foreground hover:text-destructive px-1 py-1 rounded transition-all opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteItem(m.id); }} title={t("watched.remove")}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                      </button>
                      <ChevronRight size={14} style={{ color: "var(--fg-dim)" }} />
                    </div>
                  </div>
                ))}
              </div>
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} info={t("watched.total_movies", { count: total })} />
            </>
          )}
        </section>
      )}

      {/* === Movie Detail Modal === */}
      <WishlistDetailModal open={detailMovie !== null} movie={detailMovie} detailData={detailData} loading={detailLoading} error={detailError} onClose={closeDetail} />

      {/* === Rating Modal === */}
      <WishlistRatingModal open={markingMovie !== null} movie={markingMovie} onClose={() => setMarkingMovie(null)} onConfirm={confirmMarkAsWatched} />

      {/* Empty State */}
      {total === 0 && !loading && (
        <section className="section-card">
          <div className="empty-state">
            <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <p className="text-sm font-medium">{t("wishlist.no_items")}</p>
            <p className="text-xs mt-1">{t("wishlist.no_items_hint")}</p>
          </div>
        </section>
      )}
    </div>
  );
}
