import { useState, useCallback, useRef } from "react";
import type { TFunction } from "i18next";
import type { MediaSearchResult } from "../../../types";
import * as api from "../../../api";
import { useToast } from "../../../context/ToastContext";
import { useEnrich } from "../../../context/EnrichContext";
import { Modal } from "../../Modal";
import { SearchSourceSelector } from "../../SearchSourceSelector";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Badge } from "../../ui/badge";
import { Film, Loader2 } from "lucide-react";
import { translateGenres } from "../../../utils/genre";

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
  const searchSourceRef = useRef(searchSource);
  searchSourceRef.current = searchSource;

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
      onAddSuccess();
    } catch (err: any) {
      showToast(t("watched.add_failed", { message: err.message }), "error");
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
      <div className="space-y-3">
        <SearchSourceSelector
          selected={searchSource}
          onSelect={changeSearchSource}
        />

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input type="text" placeholder={t("watched.search_placeholder_external")}
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
  );
}
