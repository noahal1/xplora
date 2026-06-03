import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { DBMovie, MovieSearchResult } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/badge";
import { Modal } from "../Modal";
import { Search, X, Film, AlertCircle, RefreshCw, Check, Loader2 } from "lucide-react";

interface RematchModalProps {
  open: boolean;
  movie: DBMovie | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function RematchModal({ open, movie, onClose, onSuccess }: RematchModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [rematchResults, setRematchResults] = useState<MovieSearchResult[]>([]);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchQuery, setRematchQuery] = useState("");
  const [rematchFocusedIdx, setRematchFocusedIdx] = useState(-1);
  const [rematchError, setRematchError] = useState("");
  const rematchSearchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rematchResultsRef = useRef<HTMLDivElement>(null);
  const rematchInputRef = useRef<HTMLInputElement>(null);

  const handleRematchSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setRematchResults([]); setRematchFocusedIdx(-1); setRematchError(""); return; }
    setRematchLoading(true);
    setRematchError("");
    try {
      const data = await api.searchMovies(q, "auto");
      setRematchResults(data.results);
      setRematchFocusedIdx(data.results.length > 0 ? 0 : -1);
    } catch {
      setRematchError(t("manage.search_failed"));
    }
    setRematchLoading(false);
  }, [t]);

  const handleRematchQueryChange = useCallback((value: string) => {
    setRematchQuery(value);
    setRematchFocusedIdx(-1);
    if (rematchSearchTimeout.current) clearTimeout(rematchSearchTimeout.current);
    rematchSearchTimeout.current = setTimeout(() => handleRematchSearch(value), 400);
  }, [handleRematchSearch]);

  const handleSelectRematch = useCallback(async (result: MovieSearchResult) => {
    if (!movie) return;
    // Close modal immediately for snappy UX
    onClose();
    try {
      await api.rematchMovie(movie.id, result.source, result.source_id, result.media_type);
      showToast(t("manage.rematch_success", { title: result.title }), "success");
      onSuccess();
    } catch (err: any) {
      showToast(t("manage.rematch_failed", { message: err.message }), "error");
    }
  }, [movie, onClose, onSuccess, showToast, t]);

  const handleRematchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (rematchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setRematchFocusedIdx((prev) => {
        const next = Math.min(prev + 1, rematchResults.length - 1);
        const el = rematchResultsRef.current?.children[next] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setRematchFocusedIdx((prev) => {
        const next = Math.max(prev - 1, 0);
        const el = rematchResultsRef.current?.children[next] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "Enter" && rematchFocusedIdx >= 0) {
      e.preventDefault();
      handleSelectRematch(rematchResults[rematchFocusedIdx]);
    }
  }, [rematchResults, rematchFocusedIdx, handleSelectRematch]);

  // Initialize search when modal opens
  useEffect(() => {
    if (open && movie) {
      setRematchQuery(movie.title);
      setRematchResults([]);
      setRematchFocusedIdx(-1);
      setRematchError("");
      setRematchLoading(true);
      handleRematchSearch(movie.title).finally(() => setRematchLoading(false));
    }
  }, [open, movie]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (rematchSearchTimeout.current) clearTimeout(rematchSearchTimeout.current);
    };
  }, []);

  return (
    <Modal open={open} onClose={onClose}
      title={<span className="flex items-center gap-2"><Search size={16} className="text-primary" />{t("manage.rematch_title")}</span>}
      description={movie ? t("manage.rematch_desc", { title: movie.title }) : ""}
    >
      {movie && (
        <div className="space-y-4">
          {/* Current movie info */}
          <div className="relative flex items-center gap-4 p-3.5 rounded-xl bg-gradient-to-r from-primary/[0.04] to-primary/[0.01] border border-primary/10">
            <div className="w-11 h-16 rounded-lg shrink-0 overflow-hidden bg-muted flex items-center justify-center shadow-sm"
              style={{ border: "1px solid var(--border-subtle)" }}>
              {movie.poster_url ? (
                <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <Film size={16} className="text-muted-foreground/30" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold truncate">{movie.title}</p>
                {movie.media_type === "tv" && (
                  <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5">TV</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                {movie.year && <span className="tabular-nums">{movie.year}</span>}
                {movie.genre && <span className="truncate max-w-[160px]">{movie.genre}</span>}
                {movie.scrape_error && (
                  <span className="inline-flex items-center gap-1 text-destructive bg-destructive/5 px-1.5 py-0.5 rounded-full text-[10px]">
                    <AlertCircle size={10} />{t("manage.rematch_error")}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-[10px] text-muted-foreground/50 font-mono tabular-nums hidden sm:block">#{movie.id}</div>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input ref={rematchInputRef} type="text" placeholder={t("manage.search_tmdb_placeholder")}
              value={rematchQuery} onChange={(e) => handleRematchQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
              className="input-field w-full pl-9 pr-8" autoFocus
            />
            {rematchQuery && (
              <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
                onClick={() => { setRematchQuery(""); setRematchResults([]); setRematchFocusedIdx(-1); rematchInputRef.current?.focus(); }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Hint */}
          {!rematchQuery && !rematchLoading && rematchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Search size={28} className="mb-2.5 opacity-30" />
              <p className="text-sm">{t("manage.search_tmdb_hint")}</p>
              <p className="text-xs mt-1 opacity-60">
                <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">↑↓</kbd> navigate · <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> select · <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Esc</kbd> close
              </p>
            </div>
          )}

          {/* Loading skeletons */}
          {rematchLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-border/50 animate-pulse">
                  <div className="w-10 h-14 rounded shrink-0 bg-muted" />
                  <div className="flex-1 space-y-2 min-w-0"><div className="h-3.5 w-3/5 rounded bg-muted" /><div className="h-3 w-2/5 rounded bg-muted" /></div>
                  <div className="h-5 w-12 rounded-full bg-muted shrink-0" />
                  <div className="h-7 w-16 rounded-lg bg-muted shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!rematchLoading && rematchError && (
            <div className="flex flex-col items-center justify-center py-6 text-destructive">
              <AlertCircle size={24} className="mb-2 opacity-60" />
              <p className="text-sm">{rematchError}</p>
              <button className="btn btn-ghost btn-xs mt-3 gap-1.5" onClick={() => handleRematchSearch(rematchQuery)}>
                <RefreshCw size={12} />{t("manage.retry")}
              </button>
            </div>
          )}

          {/* Empty results */}
          {!rematchLoading && !rematchError && rematchQuery && rematchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3"><Search size={20} className="opacity-40" /></div>
              <p className="text-sm font-medium">{t("manage.no_search_results", { query: rematchQuery })}</p>
              <p className="text-xs mt-1 opacity-60">{t("manage.try_other")}</p>
            </div>
          )}

          {/* Results */}
          {!rematchLoading && !rematchError && rematchResults.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5 mb-2">
                <span className="text-xs text-muted-foreground font-medium">{t("manage.search_results", "搜索结果")}<span className="tabular-nums ml-1 opacity-60">({rematchResults.length})</span></span>
                <span className="text-[10px] text-muted-foreground/50"><kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">↑↓</kbd> <span className="mx-0.5">·</span> <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">Enter</kbd></span>
              </div>
              <div ref={rematchResultsRef} className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1 scroll-smooth"
                onKeyDown={handleRematchKeyDown} tabIndex={0} role="listbox" aria-label="Search results">
                {rematchResults.map((result, idx) => {
                  const isCurrentMatch = result.source_id === movie.tmdb_id || result.source_id === movie.imdb_id;
                  const isFocused = idx === rematchFocusedIdx;
                  return (
                    <div key={idx} role="option" aria-selected={isFocused}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                        isCurrentMatch ? "border-green/40 bg-gradient-to-r from-green/[0.04] to-transparent"
                          : isFocused ? "border-primary/50 bg-primary/[0.04] shadow-sm"
                          : "border-border/70 hover:border-primary/30 hover:bg-accent/20 hover:shadow-sm"
                      }`}
                      onClick={() => handleSelectRematch(result)}
                      onMouseEnter={() => setRematchFocusedIdx(idx)}
                    >
                      <div className="w-11 h-[60px] rounded-lg shrink-0 overflow-hidden bg-muted flex items-center justify-center shadow-sm"
                        style={{ border: "1px solid var(--border-subtle)" }}>
                        {result.poster_url ? (
                          <img src={result.poster_url} alt={result.title} className="w-full h-full object-cover" loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : <Film size={16} className="text-muted-foreground/30" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${isCurrentMatch ? "font-semibold" : "font-medium"}`}>{result.title}</p>
                          {isCurrentMatch && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green bg-green/10 px-1.5 py-0.5 rounded-full whitespace-nowrap border border-green/20">
                              <Check size={10} />{t("manage.rematch_current")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {result.year && <span className="text-xs text-muted-foreground tabular-nums">{result.year}</span>}
                          {result.genre && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground truncate max-w-[120px]">{result.genre}</span>}
                          {result.overview && <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px] hidden sm:inline">{result.overview.slice(0, 80)}{result.overview.length > 80 ? "…" : ""}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {result.media_type === "tv" && <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5">TV</Badge>}
                        <Badge variant="outline" className={`text-[9px] leading-none px-1.5 py-0.5 ${result.source === "tmdb" ? "text-emerald border-emerald/30 bg-emerald/5" : "text-amber border-amber/30 bg-amber/5"}`}>
                          {result.source.toUpperCase()}
                        </Badge>
                      </div>
                      {!isCurrentMatch && (
                        <button className={`btn btn-xs gap-1 shrink-0 transition-all duration-150 ${isFocused ? "btn-primary" : "btn-ghost border border-border/50 hover:border-primary/30"}`}
                          onClick={(e) => { e.stopPropagation(); handleSelectRematch(result); }}>
                          <Check size={11} />{t("manage.rematch_select")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
