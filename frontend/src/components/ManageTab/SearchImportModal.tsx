import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { MovieSearchResult } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/badge";
import { Modal } from "../Modal";
import { Search, Loader2, Plus, X, ExternalLink, Film } from "lucide-react";

interface SearchImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function SearchImportModal({ open, onClose, onImportComplete }: SearchImportModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MovieSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<number>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);
  const [batchImportProgress, setBatchImportProgress] = useState<{ current: number; total: number } | null>(null);
  const searchTmdbRef = useRef<HTMLInputElement>(null);
  const searchTmdbTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) setTimeout(() => searchTmdbRef.current?.focus(), 100);
  }, [open]);

  const handleSearchTMDB = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSelectedSearchIds(new Set()); return; }
    setSearchLoading(true);
    setSelectedSearchIds(new Set());
    try {
      const data = await api.searchMovies(q, "auto");
      setSearchResults(data.results);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSearchLoading(false);
    }
  }, [showToast]);

  const handleSearchInputChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTmdbTimeout.current) clearTimeout(searchTmdbTimeout.current);
    searchTmdbTimeout.current = setTimeout(() => handleSearchTMDB(value), 400);
  }, [handleSearchTMDB]);

  const handleImportFromSearch = useCallback(async (result: MovieSearchResult) => {
    try {
      const movie = await api.addToWishlist({ title: result.title, year: result.year ?? undefined, genre: result.genre || undefined });
      try { await api.enrichMovie(movie.id); } catch {}
      showToast(t("manage.imported_from_search", { title: result.title }), "success");
      onImportComplete();
    } catch (err: any) {
      showToast(t("manage.import_failed", { message: err.message }), "error");
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

    let existingTitles = new Set<string>();
    try { const titles = await api.listMovieTitles(); titles.forEach((t) => existingTitles.add(t.toLowerCase().trim())); } catch {}

    let successCount = 0, skipCount = 0, failCount = 0, processedCount = 0;
    for (const idx of indices) {
      const result = searchResults[idx];
      if (!result) continue;
      const normalizedTitle = result.title.toLowerCase().trim();
      if (existingTitles.has(normalizedTitle)) { skipCount++; processedCount++; setBatchImportProgress({ current: processedCount, total: indices.length }); continue; }
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
    onImportComplete();

    if (successCount === 0 && skipCount > 0) showToast(t("manage.batch_import_all_duplicates", { count: skipCount }), "info");
    else if (skipCount > 0 && failCount > 0) showToast(t("manage.batch_import_skipped_errors", { imported: successCount, skipped: skipCount, failed: failCount }), "error");
    else if (skipCount > 0) showToast(t("manage.batch_import_with_skipped", { imported: successCount, skipped: skipCount }), "success");
    else if (failCount > 0) showToast(t("manage.batch_import_done_with_errors", { success: successCount, fail: failCount }), "error");
    else showToast(t("manage.batch_import_done", { count: successCount }), "success");
  }, [searchResults, selectedSearchIds, onImportComplete, showToast, t]);

  // Cleanup on unmount
  useEffect(() => { return () => { if (searchTmdbTimeout.current) clearTimeout(searchTmdbTimeout.current); }; }, []);

  return (
    <Modal open={open} onClose={() => { onClose(); setSelectedSearchIds(new Set()); }}
      title={t("manage.search_tmdb")} description={t("manage.search_tmdb_desc")}
    >
      <div className="space-y-4">
        <input ref={searchTmdbRef} type="text" placeholder={t("manage.search_tmdb_placeholder")}
          value={searchQuery} onChange={(e) => handleSearchInputChange(e.target.value)}
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
                <div key={idx}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all card-lift ${
                    selectedSearchIds.has(idx) ? "border-primary/40 bg-primary/[0.04]" : "border-border hover:border-primary/30 hover:bg-accent/20"
                  }`}
                >
                  <input type="checkbox" className="w-4 h-4 accent-primary cursor-pointer shrink-0"
                    checked={selectedSearchIds.has(idx)} onChange={() => toggleSearchSelection(idx)} />
                  <div className="w-10 h-14 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center cursor-pointer"
                    style={{ border: "1px solid var(--border-subtle)" }}
                    onClick={() => handleImportFromSearch(result)}>
                    {result.poster_url ? (
                      <img src={result.poster_url} alt={result.title} className="w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : <Film size={14} className="text-muted-foreground/40" />}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleImportFromSearch(result)}>
                    <p className="text-sm font-medium truncate">{result.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {result.year && <span className="text-xs text-muted-foreground">{result.year}</span>}
                      {result.genre && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground truncate">{result.genre}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {result.media_type === "tv" && <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5">TV</Badge>}
                    <Badge variant="outline" className="text-[10px]">{result.source.toUpperCase()}</Badge>
                  </div>
                  <button className="btn btn-xs shrink-0 gap-1" onClick={() => handleImportFromSearch(result)}>
                    <Plus size={12} />{t("wishlist.add")}
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
  );
}
