import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { MediaSearchResult } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { Modal } from "../Modal";
import { SearchResultCard } from "../shared/SearchResultCard";
import { Search, Loader2, Plus, ExternalLink } from "lucide-react";
import { SearchResultSkeleton } from "../Skeleton";

interface SearchImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function SearchImportModal({ open, onClose, onImportComplete }: SearchImportModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<number>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);
  const [batchImportProgress, setBatchImportProgress] = useState<{ current: number; total: number } | null>(null);
  const searchTmdbRef = useRef<HTMLInputElement>(null);

  // Stable ref for latest search query (avoids stale closures in callbacks/effects)
  const searchParamsRef = useRef({ query: searchQuery });
  searchParamsRef.current = { query: searchQuery };
  const searchSeqRef = useRef(0);
  const searchingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchTmdbRef.current?.focus(), 100);
  }, [open]);

  // Stable search function (reads from refs, won't trigger re-renders)
  const handleSearch = useCallback(async () => {
    const { query: q } = searchParamsRef.current;
    if (!q.trim()) { setSearchResults([]); setSelectedSearchIds(new Set()); return; }

    searchingRef.current = true;
    const seq = ++searchSeqRef.current;
    setSearchLoading(true);
    setSelectedSearchIds(new Set());
    try {
      const data = await api.searchMedia(q, "auto", "movie");
      if (seq !== searchSeqRef.current || !mountedRef.current) return; // stale or unmounted
      setSearchResults(data.results);
    } catch (err: unknown) {
      if (seq !== searchSeqRef.current || !mountedRef.current) return;
      showToast(getErrMsg(err), "error");
    } finally {
      searchingRef.current = false;
      if (mountedRef.current) setSearchLoading(false);
    }
  }, [showToast]);

  const handleImportFromSearch = useCallback(async (result: MediaSearchResult) => {
    try {
      const movie = await api.addToWishlist({ title: result.title, year: result.year ?? undefined, genre: result.genre || undefined });
      try { await api.enrichMedia(movie.id); } catch {}
      showToast(t("manage.imported_from_search", { title: result.title }), "success");
      onImportComplete();
    } catch (err: unknown) {
      showToast(t("manage.import_failed", { message: getErrMsg(err) }), "error");
    }
  }, [showToast, t, onImportComplete]);

  const toggleSearchSelection = useCallback((idx: number) => {
    setSelectedSearchIds(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  }, []);

  const toggleSelectAllSearchResults = useCallback(() => {
    if (searchResults.length === 0) return;
    setSelectedSearchIds(prev => prev.size === searchResults.length ? new Set() : new Set(searchResults.map((_, i) => i)));
  }, [searchResults]);

  const handleBatchImportFromSearch = useCallback(async () => {
    const indices = Array.from(selectedSearchIds).sort((a, b) => a - b);
    if (indices.length === 0) return;
    setImportingBatch(true);
    setBatchImportProgress({ current: 0, total: indices.length });

    let existingTitles = new Set<string>();        try { const titles = await api.listMediaTitles(); titles.forEach((t) => existingTitles.add(t.toLowerCase().trim())); } catch {}

    let successCount = 0, skipCount = 0, failCount = 0, processedCount = 0;
    for (const idx of indices) {
      const result = searchResults[idx];
      if (!result) continue;
      const normalizedTitle = result.title.toLowerCase().trim();
      if (existingTitles.has(normalizedTitle)) { skipCount++; processedCount++; setBatchImportProgress({ current: processedCount, total: indices.length }); continue; }
      try {
        const movie = await api.addToWishlist({ title: result.title, year: result.year ?? undefined, genre: result.genre || undefined });
        existingTitles.add(normalizedTitle);
        try { await api.enrichMedia(movie.id); } catch {}
        successCount++;
      } catch { failCount++; }
      processedCount++;
      setBatchImportProgress({ current: processedCount, total: indices.length });
    }

    setImportingBatch(false);
    setSelectedSearchIds(new Set());
    onImportComplete();

    if (successCount === 0 && skipCount > 0) showToast(t("manage.batch_import_all_duplicates", { count: skipCount }), "info");
    else if (skipCount > 0 && failCount > 0) showToast(t("manage.batch_import_skipped_errors", { imported: successCount, skipped: skipCount, failed: failCount }), "error");
    else if (skipCount > 0) showToast(t("manage.batch_import_with_skipped", { imported: successCount, skipped: skipCount }), "success");
    else if (failCount > 0) showToast(t("manage.batch_import_done_with_errors", { success: successCount, fail: failCount }), "error");
    else showToast(t("manage.batch_import_done", { count: successCount }), "success");
  }, [searchResults, selectedSearchIds, onImportComplete, showToast, t]);

  return (
    <Modal open={open} onClose={() => { onClose(); setSearchQuery(""); setSearchResults([]); setSearchLoading(false); setSelectedSearchIds(new Set()); }}    title={t("manage.search_tmdb")} description={t("manage.search_tmdb_desc")}
  >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input ref={searchTmdbRef} type="text" placeholder={t("manage.search_tmdb_placeholder")}
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !searchingRef.current) handleSearch(); }}
            className="input-field flex-1"
          />
          <button className="btn btn-primary btn-sm shrink-0 gap-1.5" onClick={() => { if (!searchingRef.current) handleSearch(); }} disabled={searchLoading || !searchQuery.trim()}>
            {searchLoading ? (
              <><Loader2 size={13} className="animate-spin" />{t("manage.searching")}</>
            ) : (
              <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>{t("common.search")}</>
            )}
          </button>
        </div>

        {searchLoading && (
          <SearchResultSkeleton count={3} />
        )}

        {!searchLoading && searchQuery && searchResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Search size={24} className="mb-2 opacity-40" />
            <p className="text-sm">{t("manage.no_search_results", { query: searchQuery })}</p>
          </div>
        )}

        {!searchLoading && searchResults.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" className="w-3.5 h-3.5 accent-primary cursor-pointer"
                    checked={selectedSearchIds.size === searchResults.length} onChange={toggleSelectAllSearchResults} />
                  {t("manage.batch_select_all")}
                </label>
                {selectedSearchIds.size > 0 && <span className="text-xs text-muted-foreground tabular-nums">{t("manage.batch_selected", { count: selectedSearchIds.size })}</span>}
              </div>
              <button className="btn btn-primary btn-xs gap-1.5" disabled={selectedSearchIds.size === 0 || importingBatch} onClick={handleBatchImportFromSearch}>
                {importingBatch && batchImportProgress
                  ? <span className="text-xs font-mono tabular-nums">{batchImportProgress.current}/{batchImportProgress.total}</span>
                  : <Plus size={12} />
                }
                {importingBatch ? t("manage.importing_batch") : t("manage.batch_import", { count: selectedSearchIds.size })}
              </button>
            </div>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {searchResults.map((result, idx) => (
                <SearchResultCard
                  key={`${result.source}:${result.source_id}`}
                  result={result}
                  selected={selectedSearchIds.has(idx)}
                  onToggleSelect={() => toggleSearchSelection(idx)}
                  onAdd={() => handleImportFromSearch(result)}
                  addLabel={t("wishlist.add")}
                />
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
  );
}
