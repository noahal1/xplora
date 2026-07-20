import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { searchMPTorrents, downloadMPTorrent } from "../../api";
import type { MPSearchResult } from "../../types";
import { Modal } from "../Modal";
import { useToast } from "../../context/ToastContext";
import { getErrMsg, formatBytes } from "../../lib/utils";
import { Search, Download, ExternalLink, Loader2, AlertTriangle, CheckCircle2, Filter, Subtitles, Globe } from "lucide-react";

interface PTSearchModalProps {
  open: boolean;
  onClose: () => void;
  searchQuery: string;
}

/* ── Promotion helpers ──────────────────────────────────────────── */

type PromoFilter = "all" | "free" | "2x" | "discount" | "sub";

interface PromoInfo {
  label: string;
  color: string;
  icon?: React.ReactNode;
}

function getPromotions(r: MPSearchResult): PromoInfo[] {
  const promotions: PromoInfo[] = [];
  const uvf = r.uploadvolumefactor;
  const dvf = r.downloadvolumefactor;

  if (uvf === 0 || dvf === 0) {
    promotions.push({
      label: "FREE",
      color: "bg-green-500/10 text-green-600 dark:text-green-400",
      icon: <CheckCircle2 size={8} />,
    });
  }

  if (uvf === 2) {
    promotions.push({
      label: "2x",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    });
  }

  if (dvf !== null && dvf !== undefined && dvf > 0 && dvf < 1) {
    const pct = Math.round(dvf * 100);
    promotions.push({
      label: `${pct}%`,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    });
  }

  return promotions;
}

/** Check whether a torrent matches a given promotion filter. */
function matchesFilter(r: MPSearchResult, filter: PromoFilter): boolean {
  if (filter === "all") return true;
  const uvf = r.uploadvolumefactor;
  const dvf = r.downloadvolumefactor;
  switch (filter) {
    case "free":
      return uvf === 0 || dvf === 0;
    case "2x":
      return uvf === 2;
    case "discount":
      return dvf !== null && dvf !== undefined && dvf > 0 && dvf < 1;
    case "sub":
      return hasChineseSubtitle(r.title);
  }
}

/** Detect Chinese subtitles from a torrent title by common release naming patterns. */
function hasChineseSubtitle(title: string): boolean {
  return /中字|简中|繁中|简繁|双语|双字|\bCHS\b|\bCHT\b/i.test(title);
}

function PromotionBadge({ promo }: { promo: PromoInfo }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${promo.color}`}>
      {promo.icon}{promo.label}
    </span>
  );
}

/* ── Filter config ──────────────────────────────────────────────── */

interface FilterOption {
  value: PromoFilter;
  labelKey: string;
  color: string;
  activeColor: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  {
    value: "all",
    labelKey: "全部",
    color: "bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground",
    activeColor: "bg-primary/15 text-primary shadow-sm",
  },
  {
    value: "free",
    labelKey: "FREE",
    color: "bg-accent/50 text-muted-foreground hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400",
    activeColor: "bg-green-500/15 text-green-600 dark:text-green-400 shadow-sm",
  },
  {
    value: "2x",
    labelKey: "2x",
    color: "bg-accent/50 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400",
    activeColor: "bg-blue-500/15 text-blue-600 dark:text-blue-400 shadow-sm",
  },
  {
    value: "discount",
    labelKey: "折扣",
    color: "bg-accent/50 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400",
    activeColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-sm",
  },
  {
    value: "sub",
    labelKey: "中字",
    color: "bg-accent/50 text-muted-foreground hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400",
    activeColor: "bg-sky-500/15 text-sky-600 dark:text-sky-400 shadow-sm",
  },
];

/* ── Site filter button style ───────────────────────────────────── */

function siteBtnClass(site: string, active: boolean): string {
  const base = [
    "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all",
    "border border-transparent",
  ].join(" ");
  if (active) {
    return `${base} bg-primary/15 text-primary shadow-sm border-primary/20`;
  }
  return `${base} bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground`;
}

/* ── Component ─────────────────────────────────────────────────── */

export function PTSearchModal({ open, onClose, searchQuery }: PTSearchModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<MPSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);
  const [promoFilter, setPromoFilter] = useState<PromoFilter>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");

  // ── Extract unique site names ──

  const siteNames = useMemo(() => {
    const sites = new Set<string>();
    for (const r of results) {
      sites.add(r.site || "未知");
    }
    return Array.from(sites).sort();
  }, [results]);

  // ── Filtered results (site + promo) ──

  const filteredResults = useMemo(
    () => results.filter((r) => {
      if (siteFilter !== "all" && r.site !== siteFilter) return false;
      return matchesFilter(r, promoFilter);
    }),
    [results, promoFilter, siteFilter],
  );

  // ── Search ──

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(false);
    setPromoFilter("all");
    setSiteFilter("all");
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
      setPromoFilter("all");
      setSiteFilter("all");
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
        // Show the actual MoviePilot error message so the user can diagnose
        const detailMsg = res.message || t("moviepilot.unknown_error");
        showToast(t("moviepilot.download_failed", { message: detailMsg }), "error");
      }
    } catch (err) {
      showToast(t("moviepilot.download_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setDownloadingHash(null);
    }
  };

  // ── Filter counts (promotion) ──

  const filterCounts = useMemo(() => {
    const counts: Record<PromoFilter, number> = { all: results.length, free: 0, "2x": 0, discount: 0, sub: 0 };
    for (const r of results) {
      if (r.uploadvolumefactor === 0 || r.downloadvolumefactor === 0) counts.free++;
      if (r.uploadvolumefactor === 2) counts["2x"]++;
      if (r.downloadvolumefactor !== null && r.downloadvolumefactor !== undefined && r.downloadvolumefactor > 0 && r.downloadvolumefactor < 1) counts.discount++;
      if (hasChineseSubtitle(r.title)) counts.sub++;
    }
    return counts;
  }, [results]);

  // ── Site filter counts ──

  const siteCounts = useMemo(() => {
    const counts: Record<string, number> = { all: results.length };
    for (const r of results) {
      const s = r.site || "未知";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [results]);

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

        {/* Filters */}
        {searched && results.length > 0 && (
          <div className="space-y-2">
            {/* Promotion & subtitle filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter size={12} className="text-muted-foreground/50 shrink-0" />
              {FILTER_OPTIONS.map((opt) => {
                const count = filterCounts[opt.value];
                if (count === 0 && opt.value !== "all") return null;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setPromoFilter(opt.value)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                      promoFilter === opt.value ? opt.activeColor : opt.color
                    }`}
                  >
                    {opt.labelKey}
                    <span className="text-[10px] opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Site filter pills (only show when multiple sites) */}
            {siteNames.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Globe size={12} className="text-muted-foreground/50 shrink-0" />
                {[{ site: "all", label: "全部站点" }, ...siteNames.map((s) => ({ site: s, label: s }))].map(({ site, label }) => (
                  <button
                    key={site}
                    onClick={() => setSiteFilter(site)}
                    className={siteBtnClass(site, siteFilter === site)}
                  >
                    {label}
                    <span className="text-[10px] opacity-60">{siteCounts[site] || 0}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
        ) : searched && filteredResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Filter size={20} className="text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {siteFilter !== "all" ? `当前站点「${siteFilter}」下没有匹配的种子` : "筛选项下没有结果"}
            </p>
            <button
              onClick={() => { setPromoFilter("all"); setSiteFilter("all"); }}
              className="text-xs text-primary underline mt-1"
            >
              清除全部筛选
            </button>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredResults.map((r, idx) => {
              const promos = getPromotions(r);
              const hasSub = hasChineseSubtitle(r.title);
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border transition-all overflow-hidden ${
                    hasSub
                      ? "border-sky-500/15 bg-sky-500/[0.02] hover:bg-sky-500/5"
                      : "border-border hover:bg-accent/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <p className="text-sm font-medium line-clamp-2 break-words" title={r.title}>{r.title}</p>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          {r.site || "未知"}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatBytes(r.size)}
                        </span>
                        {hasSub && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20">
                            <Subtitles size={10} />
                            中字
                          </span>
                        )}
                        {promos.map((p, i) => (
                          <PromotionBadge key={i} promo={p} />
                        ))}
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
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
