import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { searchMPTorrents, downloadMPTorrent } from "../../api";
import type { MPSearchResult } from "../../types";
import { Modal } from "../Modal";
import { useToast } from "../../context/ToastContext";
import { getErrMsg, formatBytes } from "../../lib/utils";
import { Search, Download, ExternalLink, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface PTSearchModalProps {
  open: boolean;
  onClose: () => void;
  searchQuery: string;
}

export function PTSearchModal({ open, onClose, searchQuery }: PTSearchModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<MPSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);

  // ── Search ──

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(false);
    try {
      const data = await searchMPTorrents(q);
      setResults(data.results);
      setSearched(true);
    } catch (err) {
      showToast(t("moviepilot.verify_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    if (open && searchQuery) {
      setQuery(searchQuery);
      doSearch(searchQuery);
    }
  }, [open, searchQuery, doSearch]);

  useEffect(() => {
    if (!open) {
      setResults([]);
      setSearched(false);
      setDownloadingHash(null);
    }
  }, [open]);

  // ── Download ──

  const handleDownload = async (result: MPSearchResult) => {
    setDownloadingHash(result.download_url);
    try {
      const res = await downloadMPTorrent(result.title, result.download_url);
      if (res.success) {
        showToast(t("moviepilot.download_success"), "success");
      } else {
        showToast(t("moviepilot.download_failed", { message: res.message }), "error");
      }
    } catch (err) {
      showToast(t("moviepilot.download_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setDownloadingHash(null);
    }
  };

  // ── Render ──

  return (
    <Modal open={open} onClose={onClose} title={t("moviepilot.search_title")}>
      <div className="space-y-4">
        {/* Search input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(query); }}
            placeholder={t("moviepilot.search_placeholder")}
            className="input-field flex-1 h-9 text-sm"
          />
          <button
            onClick={() => doSearch(query)}
            disabled={loading || !query.trim()}
            className="btn btn-primary btn-sm gap-1.5"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            {loading ? t("moviepilot.searching") : t("common.search")}
          </button>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        ) : searched && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle size={24} className="text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t("moviepilot.no_results", { query })}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {t("moviepilot.no_results_hint")}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {results.map((r, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Title */}
                    <p className="text-sm font-medium line-clamp-2" title={r.title}>{r.title}</p>

                    {/* Meta row */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        {r.site}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatBytes(r.size)}
                      </span>
                      {r.is_free && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                          <CheckCircle2 size={8} />
                          {t("moviepilot.free")}
                        </span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground tabular-nums">
                      <span>↑ {r.seeders}</span>
                      <span>↓ {r.leechers}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {r.page_url && (
                      <a
                        href={r.page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-xs p-1"
                        title={t("common.open")}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <button
                      onClick={() => handleDownload(r)}
                      disabled={downloadingHash === r.download_url}
                      className="btn btn-primary btn-xs gap-1"
                    >
                      {downloadingHash === r.download_url ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      {t("moviepilot.download")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
