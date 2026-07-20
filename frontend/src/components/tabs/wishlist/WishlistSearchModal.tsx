import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { MediaSearchResult, ExternalDetail } from "../../../types";
import * as api from "../../../api";
import { useToast } from "../../../context/ToastContext";
import { useEnrich } from "../../../context/EnrichContext";
import { getErrMsg } from "../../../lib/utils";
import { Modal } from "../../Modal";
import { SearchSourceSelector } from "../../SearchSourceSelector";
import { SearchResultCard } from "../../shared/SearchResultCard";
import { Loader2 } from "lucide-react";
import { SearchResultSkeleton } from "../../Skeleton";
import { WishlistDetailModal } from "../../WishlistTab/DetailModal";

interface WishlistSearchModalProps {
  open: boolean;
  onClose: () => void;
  onAddSuccess: () => void;
  existingTitles: string[];
}

export function WishlistSearchModal({ open, onClose, onAddSuccess, existingTitles }: WishlistSearchModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();

  const [searchSource, setSearchSource] = useState("auto");
  const [externalQuery, setExternalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchDone, setSearchDone] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [searchSortField, setSearchSortField] = useState<"year" | "title">("year");
  const [searchSortDir, setSearchSortDir] = useState<"asc" | "desc">("desc");
  const [searchSourceFilter, setSearchSourceFilter] = useState<string>("");
  const [searchMediaType, setSearchMediaType] = useState<string>("movie");

  // External search detail modal
  const [detailMovie, setDetailMovie] = useState<MediaSearchResult | null>(null);
  const [detailData, setDetailData] = useState<ExternalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const searchSourceRef = useRef(searchSource);
  searchSourceRef.current = searchSource;

  // Stable ref for latest search query (avoids stale closures in callbacks/effects)
  const searchParamsRef = useRef({ query: externalQuery });
  searchParamsRef.current = { query: externalQuery };
  const searchSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Stable search function (reads from refs, won't trigger re-renders)
  const handleSearch = useCallback(async () => {
    const { query: q } = searchParamsRef.current;
    if (!q.trim()) { setSearchResults([]); setSearchError(""); setSearchDone(false); return; }

    const seq = ++searchSeqRef.current;
    setSearchLoading(true);
    setSearchError("");
    try {
      const data = await api.searchMedia(
        q.trim(),
        searchSourceRef.current,
        searchMediaType === "all" ? undefined : searchMediaType,
      );
      if (seq !== searchSeqRef.current || !mountedRef.current) return;
      setSearchResults(data.results);
      setSearchDone(true);
    } catch (err: unknown) {
      if (seq !== searchSeqRef.current || !mountedRef.current) return;
      setSearchError(getErrMsg(err));
      setSearchResults([]);
      setSearchDone(true);
    } finally {
      if (seq === searchSeqRef.current && mountedRef.current) {
        setSearchLoading(false);
      }
    }
  }, []);

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
    } catch (err: unknown) { setDetailError(getErrMsg(err)); }
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
      onAddSuccess();
    } catch (err: unknown) { showToast(t("wishlist.add_failed", { message: getErrMsg(err) }), "error"); }
    finally { setAddingIds((prev) => { const next = new Set(prev); next.delete(key); return next; }); }
  }, [addingIds, showToast, startPolling, onAddSuccess, t]);

  const sortedResults = useMemo(() => {
    return [...searchResults]
      .filter((r) => !searchSourceFilter || r.source === searchSourceFilter)
      .sort((a, b) => {
        if (searchSortField === "year") {
          const va = a.year ?? (searchSortDir === "asc" ? Infinity : -Infinity);
          const vb = b.year ?? (searchSortDir === "asc" ? Infinity : -Infinity);
          return searchSortDir === "asc" ? va - vb : vb - va;
        }
        const va = (a.title || "").toLowerCase();
        const vb = (b.title || "").toLowerCase();
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

  const clearSearch = useCallback(() => {
    setExternalQuery("");
    setSearchResults([]);
    setSearchDone(false);
    setSearchError("");
  }, []);

  const handleClose = useCallback(() => {
    clearSearch();
    onClose();
  }, [clearSearch, onClose]);

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={t("wishlist.search_movies")}
      >
        <div className="space-y-3">
          <SearchSourceSelector
            selected={searchSource}
            onSelect={changeSearchSource}
          />

          {/* Media type filter pills */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground shrink-0">{t("manage.media_type")}</span>
            {[
              { value: "movie", label: t("manage.media_type_movie") },
              { value: "tv", label: t("manage.media_type_tv") },
              { value: "all", label: t("manage.media_type_all") },
            ].map((opt) => (
              <button
                key={opt.value}
                className={`pill ${searchMediaType === opt.value ? "active" : ""}`}
                onClick={() => setSearchMediaType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input type="text" placeholder={t("wishlist.search_placeholder")}
                value={externalQuery} onChange={(e) => setExternalQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                className="input-field w-full h-10 text-sm pl-3 pr-10" />
              {externalQuery && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  onClick={clearSearch}>
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

          {searchLoading && externalQuery.trim() && (
            <SearchResultSkeleton count={3} />
          )}

          {!searchLoading && searchResults.length > 0 && (
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
                  {sortedResults.map((r) => {
                    const key = `${r.source}:${r.source_id}`;
                    const isAdding = addingIds.has(key);
                    const alreadyInList = existingTitles.some((title) => title.toLowerCase() === r.title.toLowerCase());
                    return (
                      <SearchResultCard
                        key={key}
                        result={r}
                        progressivePoster
                        adding={isAdding}
                        alreadyAdded={alreadyInList}
                        onAdd={() => addSearchResultToWishlist(r)}
                        onDetail={() => openDetail(r)}
                      />
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

      <WishlistDetailModal open={detailMovie !== null} movie={detailMovie} detailData={detailData} loading={detailLoading} error={detailError} onClose={closeDetail} />
    </>
  );
}
