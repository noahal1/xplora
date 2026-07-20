import { useState, useCallback, useRef, useEffect } from "react";
import type { TFunction } from "i18next";
import type { MediaSearchResult } from "../../../types";
import * as api from "../../../api";
import { useToast } from "../../../context/ToastContext";
import { useEnrich } from "../../../context/EnrichContext";
import { getErrMsg } from "../../../lib/utils";
import { Modal } from "../../Modal";
import { SearchSourceSelector } from "../../SearchSourceSelector";
import { SearchResultCard } from "../../shared/SearchResultCard";
import { Loader2 } from "lucide-react";
import { SearchResultSkeleton } from "../../Skeleton";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onAddSuccess: () => void;
  t: TFunction;
}

export function SearchModal({ open, onClose, onAddSuccess, t }: SearchModalProps) {
  const { showToast } = useToast();
  const { startPolling } = useEnrich();

  const [searchSource, setSearchSource] = useState("auto");
  const [externalQuery, setExternalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchDone, setSearchDone] = useState(false);
  const [addingSearchIds, setAddingSearchIds] = useState<Set<string>>(new Set());
  const [searchMediaType, setSearchMediaType] = useState<string>("movie");
  const searchSourceRef = useRef(searchSource);
  searchSourceRef.current = searchSource;

  // Stable ref for latest search query (avoids stale closures in callbacks/effects)
  const searchParamsRef = useRef({ query: externalQuery });
  searchParamsRef.current = { query: externalQuery };
  const searchSeqRef = useRef(0);
  const searchingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Stable search function (reads from refs, won't trigger re-renders)
  const handleSearch = useCallback(async () => {
    const { query: q } = searchParamsRef.current;
    if (!q.trim()) { setSearchResults([]); setSearchError(""); setSearchDone(false); return; }

    searchingRef.current = true;
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
      searchingRef.current = false;
      if (mountedRef.current) setSearchLoading(false);
    }
  }, []);

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
      onAddSuccess();
    } catch (err: unknown) {
      showToast(t("watched.add_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAddingSearchIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [addingSearchIds, showToast, startPolling, t, onAddSuccess]);

  const clearSearch = useCallback(() => {
    setExternalQuery("");
    setSearchResults([]);
    setSearchDone(false);
    setSearchError("");
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("watched.search_title")}
    >
      <div className="space-y-3">          <SearchSourceSelector
            selected={searchSource}
            onSelect={changeSearchSource}
          />

          {/* Media type filter pills */}
          <div className="flex items-center gap-1.5 mb-1">
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
            <input type="text" placeholder={t("watched.search_placeholder_external")}
              value={externalQuery} onChange={(e) => setExternalQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !searchingRef.current) handleSearch(); }}
              className="input-field w-full h-10 text-sm pl-3 pr-10" />
            {externalQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                onClick={clearSearch}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            )}
          </div>
          <button className="btn btn-primary btn-sm shrink-0 gap-1.5" onClick={() => { if (!searchingRef.current) handleSearch(); }} disabled={searchLoading || !externalQuery.trim()}>
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
            {searchResults.map((r) => {
              const key = `${r.source}:${r.source_id}`;
              const isAdding = addingSearchIds.has(key);
              return (
                <SearchResultCard
                  key={key}
                  result={r}
                  progressivePoster
                  adding={isAdding}
                  onAdd={() => addSearchResultToWatched(r)}
                  addLabel={t("watched.add_to_list")}
                />
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
  );
}
