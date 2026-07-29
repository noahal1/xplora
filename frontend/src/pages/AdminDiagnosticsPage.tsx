import { useState, useEffect, useMemo, useRef } from "react";
import { useToast } from "../context/ToastContext";
import { getMediaDiagnostics, enrichAllMedia, enrichMedia, aiRepairMedia, getAiRepairStatus, aiInferMedia } from "../api";
import { getErrMsg } from "../lib/utils";
import { useNavigate } from "react-router-dom";
import type { MediaDetail } from "../types";
import FadeContent from "../components/FadeContent";
import { Pagination } from "../components/Pagination";
import { RematchModal } from "../components/ManageTab/RematchModal";
import { DetailModal } from "../components/ManageTab/DetailModal";
import { AlertTriangle, Image, FileText, Clock, Hash, MapPin, Search, CheckCircle, XCircle, Sparkles, Loader2, Info, Film, BrainCircuit } from "lucide-react";

interface DiagItem {
  id: number;
  title: string;
  year: number | null;
  media_type: string;
  status: string;
  rating: number;
  missing_fields: Array<{ field: string; label: string }>;
  missing_count: number;
  has_scrape_error: boolean;
  scrape_error: string | null;
  poster_url: string | null;
  overview: string | null;
  genre: string | null;
  runtime: number | null;
  imdb_id: string | null;
  tmdb_id: string | null;
  country: string | null;
  tagline: string | null;
  tv_series_id: string | null;
  season_number: number | null;
  episode_count: number | null;
  series_poster_url: string | null;
  created_at: string;
}

interface DiagData {
  summary: {
    total: number;
    healthy: number;
    has_issues: number;
    missing_poster_url: number;
    missing_overview: number;

    missing_runtime: number;
    missing_tmdb_id: number;
    missing_country: number;
    missing_episode_count: number;
    has_scrape_error: number;
  };
  items: DiagItem[];
}

const DIAG_PAGE_SIZE = 20;

const FILTER_OPTIONS = [
  { value: "all", label: "全部", icon: null },
  { value: "poster_url", label: "海报", icon: "Image" },
  { value: "overview", label: "简介", icon: "FileText" },

  { value: "episode_count", label: "集数", icon: "Hash" },
  { value: "runtime", label: "时长", icon: "Clock" },
  { value: "tmdb_id", label: "TMDB ID", icon: "Hash" },
  { value: "country", label: "国家", icon: "MapPin" },
  { value: "scrape_error", label: "刮削异常", icon: "XCircle" },
];

/* ── Mobile Card Component ──────────────────────────────────── */
function DiagMobileCard({ item, enrichingIds, onEnrich, onAiInfer, onDetail, onRematch }: {
  item: DiagItem;
  enrichingIds: Set<number>;
  onEnrich: (item: DiagItem) => Promise<void>;
  onAiInfer: (item: DiagItem) => Promise<void>;
  onDetail: (item: MediaDetail) => void;
  onRematch: (item: MediaDetail) => void;
}) {
  return (
    <div
      className="p-3 rounded-xl transition-all duration-200 bg-bg-card border border-border"
    >
      {/* Row 1: Poster + Title/Meta */}
      <div className="flex items-start gap-2.5">
        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer border border-border-subtle"
          onClick={() => onDetail(toMediaDetail(item))}
        >
          {item.poster_url ? (
            <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <Film size={16} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <button
                className="font-medium text-sm truncate w-full text-left hover:text-primary transition-colors"
                onClick={() => onDetail(toMediaDetail(item))}
              >
                {item.title}
              </button>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {/* Year */}
                {item.year && <span className="text-[11px] text-muted-foreground tabular-nums">{item.year}</span>}
                {/* Media type */}
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  item.media_type === "tv" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                }`}>
                  {item.media_type === "tv" ? "剧集" : "电影"}
                </span>
                {/* Status */}
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  item.status === "wish" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-accent text-accent-foreground"
                }`}>
                  {item.status === "wish" ? "想看" : "已看"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Missing fields tags */}
      {item.missing_fields.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.missing_fields.map((f) => (
            <span key={f.field} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {f.label}
            </span>
          ))}
        </div>
      )}

      {/* Scrape error */}
      {item.scrape_error && (
        <div className="mt-1.5 text-[10px] text-red-500/80 truncate" title={item.scrape_error}>
          <XCircle size={10} className="inline mr-0.5 shrink-0" />
          {item.scrape_error}
        </div>
      )}          {/* Action buttons — wrap on narrow screens */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <MobileActionBtn
          icon={enrichingIds.has(item.id) ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          label={enrichingIds.has(item.id) ? "刮削中" : "刮削"}
          onClick={() => onEnrich(item)}
          disabled={enrichingIds.has(item.id)}
          className={enrichingIds.has(item.id) ? "text-primary" : "hover:text-amber"}
        />
        <MobileActionBtn
          icon={<BrainCircuit size={13} />}
          label="AI"
          onClick={() => onAiInfer(item)}
          className="hover:text-violet-500"
        />
        <MobileActionBtn
          icon={<Info size={13} />}
          label="详情"
          onClick={() => onDetail(toMediaDetail(item))}
        />
        <MobileActionBtn
          icon={<Search size={13} />}
          label="重匹配"
          onClick={() => onRematch(toMediaDetail(item))}
          className={item.has_scrape_error ? "text-amber" : ""}
        />
      </div>
    </div>
  );
}

/* ── Mobile action button helper ─────────────────────────────── */
function MobileActionBtn({ icon, label, onClick, disabled, className }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none ${className || ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function toMediaDetail(item: DiagItem): MediaDetail {
  return {
    id: item.id,
    title: item.title,
    year: item.year,
    media_type: item.media_type,
    status: item.status,
    rating: item.rating,
    scrape_error: item.scrape_error,
    poster_url: item.poster_url,
    genre: item.genre,
    overview: item.overview,
    runtime: item.runtime,
    imdb_id: item.imdb_id,
    tmdb_id: item.tmdb_id,
    country: item.country,
    tagline: item.tagline,
    tv_series_id: item.tv_series_id,
    season_number: item.season_number,
    episode_count: item.episode_count,
    series_poster_url: item.series_poster_url,
    created_at: item.created_at,
  };
}

export function AdminDiagnosticsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [diagData, setDiagData] = useState<DiagData | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [aiRepairing, setAiRepairing] = useState(false);
  const [aiRepairResult, setAiRepairResult] = useState<string | null>(null);
  const [aiRepairProgress, setAiRepairProgress] = useState<{
    status: string | null;
    step: string;
    message: string;
    total: number;
    current: number;
  } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [diagFilter, setDiagFilter] = useState<string>("all");
  const [diagPage, setDiagPage] = useState(0);
  const [enrichingIds, setEnrichingIds] = useState<Set<number>>(new Set());
  const [aiInferringIds, setAiInferringIds] = useState<Set<number>>(new Set());
  const [aiInferConfirm, setAiInferConfirm] = useState<{
    itemId: number;
    title: string;
    existingGenre: string | null;
    existingCountry: string | null;
    aiGenre: string | null;
    aiCountry: string | null;
  } | null>(null);
  const [rematchMovie, setRematchMovie] = useState<MediaDetail | null>(null);
  const [detailMovie, setDetailMovie] = useState<MediaDetail | null>(null);

  const filteredItems = useMemo(() => {
    if (!diagData) return [];
    if (diagFilter === "all") return diagData.items;
    if (diagFilter === "scrape_error") return diagData.items.filter((i) => i.has_scrape_error);
    return diagData.items.filter((i) => i.missing_fields.some((f) => f.field === diagFilter));
  }, [diagData, diagFilter]);

  const paginatedItems = useMemo(() => {
    const start = diagPage * DIAG_PAGE_SIZE;
    return filteredItems.slice(start, start + DIAG_PAGE_SIZE);
  }, [filteredItems, diagPage]);

  const diagTotalPages = Math.ceil(filteredItems.length / DIAG_PAGE_SIZE);

  const handleAiInfer = async (item: DiagItem) => {
    let needsReview = false;
    setAiInferringIds(prev => new Set(prev).add(item.id));
    try {
      const result = await aiInferMedia(item.id);
      if (result.needs_review) {
        needsReview = true;
        setAiInferConfirm({
          itemId: item.id,
          title: result.title,
          existingGenre: result.existing_genre,
          existingCountry: result.existing_country,
          aiGenre: result.ai_genre,
          aiCountry: result.ai_country,
        });
        return;
      }
      if (result.updated) {
        showToast(`「${result.title}」AI 推断成功`, "success");
      } else {
        showToast(`「${result.title}」${result.message}`, "success");
      }
      silentRefresh();
    } catch (err) {
      showToast(`AI 推断失败: ${getErrMsg(err)}`, "error");
    } finally {
      if (!needsReview) {
        setAiInferringIds(prev => { const next = new Set(prev); next.delete(item.id); return next; });
      }
    }
  };

  const handleAiInferApply = async () => {
    const confirm = aiInferConfirm;
    if (!confirm) return;
    const fields: { genre?: string | null; country?: string | null } = {};
    if (confirm.aiGenre) fields.genre = confirm.aiGenre;
    if (confirm.aiCountry) fields.country = confirm.aiCountry;
    setAiInferConfirm(null);
    try {
      const result = await aiInferMedia(confirm.itemId, fields);
      if (result.updated) {
        showToast(`「${result.title}」AI 推断已应用`, "success");
      } else {
        showToast(`「${result.title}」${result.message}`, "success");
      }
      silentRefresh();
    } catch (err) {
      showToast(`AI 推断应用失败: ${getErrMsg(err)}`, "error");
    } finally {
      setAiInferringIds(prev => { const next = new Set(prev); next.delete(confirm.itemId); return next; });
    }
  };

  const handleAiInferDismiss = () => {
    if (aiInferConfirm) {
      setAiInferringIds(prev => { const next = new Set(prev); next.delete(aiInferConfirm.itemId); return next; });
    }
    setAiInferConfirm(null);
  };

  const handleEnrich = async (item: DiagItem) => {
    setEnrichingIds(prev => new Set(prev).add(item.id));
    try {
      await enrichMedia(item.id, "tmdb");
      showToast(`「${item.title}」刮削成功`, "success");
      // 静默刷新，不闪烁页面、不重置分页
      silentRefresh();
    } catch (err) {
      showToast(`刮削失败: ${getErrMsg(err)}`, "error");
    } finally {
      setEnrichingIds(prev => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  const loadDiagnostics = async () => {
    setDiagLoading(true);
    setDiagData(null);
    setDiagPage(0);
    try {
      const data = await getMediaDiagnostics();
      setDiagData(data);
    } catch (err) {
      showToast("诊断失败: " + getErrMsg(err), "error");
    } finally {
      setDiagLoading(false);
    }
  };

  /** Silent refresh: don't show loading spinner, don't clear data, don't reset page */
  const silentRefresh = async () => {
    try {
      const data = await getMediaDiagnostics();
      setDiagData(data);
    } catch {
      // Silently ignore — the triggering action already showed a toast
    }
  };

  const startAiRepairPolling = () => {
    // Clear any existing poll
    if (pollingRef.current) clearInterval(pollingRef.current);
    setAiRepairProgress({ status: "running", step: "starting", message: "正在启动...", total: 0, current: 0 });

    pollingRef.current = setInterval(async () => {
      try {
        const progress = await getAiRepairStatus();
        if (!progress.status) {
          // No active repair — stop polling
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setAiRepairing(false);
          setAiRepairProgress(null);
          return;
        }

        setAiRepairProgress(progress);

        if (progress.status === "done") {
          // Repair complete
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setAiRepairing(false);
          setAiRepairResult(progress.message || "AI 修复完成");
          setAiRepairProgress(null);
          showToast(progress.message || "AI 修复完成", "success");
          // Refresh diagnostics
          silentRefresh();
        } else if (progress.status === "error") {
          // Repair failed
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setAiRepairing(false);
          setAiRepairResult(progress.message || "AI 修复失败");
          setAiRepairProgress(null);
          showToast(progress.message || "AI 修复失败", "error");
        }
      } catch {
        // Ignore polling errors — will retry on next interval
      }
    }, 2000);
  };

  const handleAiRepair = async () => {
    setAiRepairing(true);
    setAiRepairResult(null);
    setAiRepairProgress(null);
    try {
      const result = await aiRepairMedia();
      showToast(result.message || "AI 修复已启动", "success");
      // Start polling for progress
      startAiRepairPolling();
    } catch (err) {
      showToast("AI 修复失败: " + getErrMsg(err), "error");
      setAiRepairResult("AI 修复失败: " + getErrMsg(err));
      setAiRepairing(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleEnrichAll = async () => {
    setEnriching(true);
    try {
      const result = await enrichAllMedia();
      if (result.enqueued === 0) {
        showToast("所有条目已刮削，无需处理", "success");
      } else {
        showToast(`已加入刮削队列：${result.enqueued} 条，后台正在处理`, "success");
      }
      setTimeout(loadDiagnostics, 2000);
    } catch (err) {
      showToast("批量刮削失败: " + getErrMsg(err), "error");
    } finally {
      setEnriching(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold tracking-tight">媒体诊断</h1>
      </div>

      <FadeContent className="section-card">          <div className="section-header max-sm:flex-wrap max-sm:gap-2">
          <h2 className="section-title flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            媒体诊断
            {diagData && (
              <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                {diagData.summary.healthy}/{diagData.summary.total} 正常
              </span>
            )}
          </h2>
          <button
            onClick={handleAiRepair}
            disabled={aiRepairing || !diagData || diagData.summary.total === 0}
            className="btn btn-ghost btn-sm gap-1.5 text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-500/10"
          >
            <BrainCircuit className={`w-3.5 h-3.5 ${aiRepairing ? "animate-pulse" : ""}`} />
            {aiRepairing ? "AI 修复中..." : "AI 修复"}
          </button>
          <button
            onClick={handleEnrichAll}
            disabled={enriching || !diagData || diagData.summary.has_issues === 0}
            className="btn btn-primary btn-sm gap-1.5"
          >
            <svg className={`w-3.5 h-3.5 ${enriching ? "animate-stream-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            {enriching ? "刮削中..." : "一键刮削"}
          </button>
          <button
            onClick={loadDiagnostics}
            disabled={diagLoading}
            className="btn btn-ghost btn-sm gap-1.5"
          >
            <svg className={`w-3.5 h-3.5 ${diagLoading ? "animate-stream-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            刷新
          </button>
        </div>

        {diagLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        ) : diagData ? (
          <div className="space-y-6">
            {/* ── AI Repair Progress Card ──────────────────── */}
            {aiRepairProgress && (
              <div className="card p-4 sm:p-5 space-y-3 border-violet-500/20 bg-violet-500/5">
                <div className="flex items-center gap-2.5">
                  <div className="relative w-8 h-8">
                    <BrainCircuit size={18} className="absolute inset-0 m-auto text-violet-600 dark:text-violet-400" />
                    {aiRepairProgress.status === "running" && (
                      <div className="w-8 h-8 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-stream-spin" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-violet-700 dark:text-violet-300">
                      AI 数据修复
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {aiRepairProgress.message}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {aiRepairProgress.status === "running" && aiRepairProgress.total > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">进度</span>
                      <span className="text-violet-600 dark:text-violet-400 tabular-nums">
                        {Math.round((aiRepairProgress.current / aiRepairProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-violet-500/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.min(100, (aiRepairProgress.current / Math.max(1, aiRepairProgress.total)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {aiRepairProgress.status === "running" && aiRepairProgress.total === 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                    正在分析媒体库...
                  </div>
                )}
              </div>
            )}

            {/* ── Summary Cards ─────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CheckCircle size={14} className="sm:size-4 text-primary" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.healthy}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">正常 / {diagData.summary.total}</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={14} className="sm:size-4 text-destructive" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.has_issues}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">有问题的条目</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Image size={14} className="sm:size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.missing_poster_url}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">缺失海报</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <FileText size={14} className="sm:size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.missing_overview}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">缺失简介</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Clock size={14} className="sm:size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.missing_runtime}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">缺失时长</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Hash size={14} className="sm:size-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.missing_episode_count}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">缺失集数（TV）</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Hash size={14} className="sm:size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.missing_tmdb_id}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">缺失 TMDB ID</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <MapPin size={14} className="sm:size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.missing_country}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">缺失国家</div>
                </div>
              </div>

              <div className="card p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <XCircle size={14} className="sm:size-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold tabular-nums">{diagData.summary.has_scrape_error}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground">刮削异常</div>
                </div>
              </div>
            </div>

            {/* ── Filter Buttons ──────────────────────────── */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setDiagFilter(opt.value); setDiagPage(0); }}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs sm:text-[11px] font-medium transition-all ${
                    diagFilter === opt.value
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {opt.label}
                  {opt.value !== "all" && diagData && (
                    <span className="text-[10px] opacity-60">(
                      {opt.value === "scrape_error"
                        ? diagData.summary.has_scrape_error
                        : (diagData.summary as Record<string, number>)[`missing_${opt.value}`] ?? 0}
                    )</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Issues Table / Mobile Cards ──────────────── */}
            {filteredItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-destructive" />
                  详细问题列表
                  <span className="text-muted-foreground font-normal">
                    ({filteredItems.length}{diagFilter !== "all" ? ` / ${diagData.items.length}` : ""} 项)
                  </span>
                </h3>

                {/* ── Desktop Table ───────────────────────────── */}
                <div className="max-sm:hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium">标题</th>
                          <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-16">类型</th>
                          <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-16">状态</th>
                          <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium">缺失字段</th>
                          <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium">刮削错误</th>
                          <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-20">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedItems.map((item) => (
                          <tr key={item.id} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
                            <td className="px-2 py-2.5">
                            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                              <button
                                className="font-medium text-xs text-left hover:text-primary transition-colors cursor-pointer truncate max-w-[180px]"
                                onClick={() => setDetailMovie(toMediaDetail(item))}
                              >
                                {item.title}
                              </button>
                              {item.year && <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">({item.year})</span>}
                            </span>
                            </td>
                            <td className="px-2 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                              item.media_type === "tv" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            }`}>
                              {item.media_type === "tv" ? "剧集" : "电影"}
                            </span>
                            </td>
                            <td className="px-2 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                              item.status === "wish" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-accent text-accent-foreground"
                            }`}>
                              {item.status === "wish" ? "想看" : "已看"}
                            </span>
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {item.missing_fields.map((f) => (
                                  <span key={f.field} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                    {f.label}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-2.5">
                              {item.scrape_error ? (
                                <span className="text-[10px] text-red-500/80 block max-w-[160px] truncate" title={item.scrape_error}>
                                  <XCircle size={10} className="inline mr-0.5" />
                                  {item.scrape_error}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2.5 whitespace-nowrap">
                              <div className="inline-flex items-center gap-0.5" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--seed-radius)", padding: "1px" }}>
                                <button
                                  className={`px-1.5 py-1 rounded transition-colors ${enrichingIds.has(item.id) ? "text-primary animate-pulse" : "text-muted-foreground hover:text-amber"} hover:bg-amber/10`}
                                  onClick={() => handleEnrich(item)}
                                  disabled={enrichingIds.has(item.id)}
                                  title={enrichingIds.has(item.id) ? "刮削中..." : "刮削"}
                                >
                                  {enrichingIds.has(item.id) ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                </button>
                                <button
                                  className={`px-1.5 py-1 rounded transition-colors ${aiInferringIds.has(item.id) ? "text-violet-500 animate-pulse" : "text-muted-foreground hover:text-violet-500"} hover:bg-violet-500/10`}
                                  onClick={() => handleAiInfer(item)}
                                  disabled={aiInferringIds.has(item.id)}
                                  title={aiInferringIds.has(item.id) ? "AI 推断中..." : "AI 推断"}
                                >
                                  <BrainCircuit size={14} />
                                </button>
                                <button
                                  className="px-1.5 py-1 rounded transition-colors text-muted-foreground hover:text-sky hover:bg-sky/10"
                                  onClick={() => setDetailMovie(toMediaDetail(item))}
                                  title="查看详情"
                                >
                                  <Info size={14} />
                                </button>
                                <button
                                  className={`px-1.5 py-1 rounded transition-colors ${item.has_scrape_error ? "text-amber" : "text-muted-foreground"} hover:text-sky hover:bg-sky/10`}
                                  onClick={() => setRematchMovie(toMediaDetail(item))}
                                  title={item.has_scrape_error ? "重新匹配（刮削异常）" : "重新匹配"}
                                >
                                  <Search size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Mobile Cards ──────────────────────────────── */}
                <div className="sm:hidden space-y-2.5">
                  {paginatedItems.map((item) => (
                    <DiagMobileCard
                      key={item.id}
                      item={item}
                      enrichingIds={enrichingIds}
                      onEnrich={handleEnrich}
                      onAiInfer={handleAiInfer}
                      onDetail={setDetailMovie}
                      onRematch={setRematchMovie}
                    />
                  ))}
                </div>

                <Pagination
                  currentPage={diagPage}
                  totalPages={diagTotalPages}
                  onPageChange={setDiagPage}
                  info={`${diagPage * DIAG_PAGE_SIZE + 1}–${Math.min((diagPage + 1) * DIAG_PAGE_SIZE, filteredItems.length)} / ${filteredItems.length}`}
                />
              </div>
            )}

            {filteredItems.length === 0 && diagData.items.length > 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <Search size={16} className="opacity-50" />
                筛选条件下没有结果
                <button onClick={() => setDiagFilter("all")} className="text-primary underline ml-1">显示全部</button>
              </div>
            )}

            {diagData.items.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <CheckCircle size={16} className="text-green-500" />
                所有条目元数据完整，无需处理
              </div>
            )}

            {/* ── AI Repair Result Banner ───────────────────── */}
            {aiRepairResult && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs">
                <BrainCircuit size={14} className="shrink-0" />
                <span>{aiRepairResult}</span>
                <button
                  onClick={() => setAiRepairResult(null)}
                  className="ml-auto shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-sm text-muted-foreground">
            点击「刷新」按钮开始诊断
          </div>
        )}
      </FadeContent>

      {/* ── Rematch Modal ──────────────────────────────────── */}
      <RematchModal
        open={rematchMovie !== null}
        movie={rematchMovie}
        onClose={() => setRematchMovie(null)}
        onSuccess={() => { setRematchMovie(null); silentRefresh(); }}
      />

      {/* ── Detail Modal ────────────────────────────────────── */}
      <DetailModal
        open={detailMovie !== null}
        movie={detailMovie}
        onClose={() => setDetailMovie(null)}
        onSave={() => { setDetailMovie(null); silentRefresh(); }}
      />

      {/* ── AI Infer Confirmation Modal ───────────────────────── */}
      {aiInferConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-md rounded-xl bg-bg-card border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <BrainCircuit size={16} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">AI 推断结果确认</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  「{aiInferConfirm.title}」的 AI 推断结果与现有数据不同
                </p>
              </div>
            </div>

            {/* Genre comparison */}
            <div className="p-3 rounded-lg bg-accent/30">
              <div className="text-xs font-medium mb-2">类型 (Genre)</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded border border-border/60 bg-bg-card text-xs">
                  <div className="text-muted-foreground mb-0.5">现有</div>
                  <div className="font-medium">{aiInferConfirm.existingGenre || <span className="text-muted-foreground italic">无</span>}</div>
                </div>
                <div className="p-2 rounded border border-violet-500/30 bg-violet-500/5 text-xs">
                  <div className="text-violet-600 dark:text-violet-400 mb-0.5">AI 建议</div>
                  <div className="font-medium">{aiInferConfirm.aiGenre || <span className="text-muted-foreground italic">无</span>}</div>
                </div>
              </div>
            </div>

            {/* Country comparison */}
            <div className="p-3 rounded-lg bg-accent/30">
              <div className="text-xs font-medium mb-2">国家 (Country)</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded border border-border/60 bg-bg-card text-xs">
                  <div className="text-muted-foreground mb-0.5">现有</div>
                  <div className="font-medium">{aiInferConfirm.existingCountry || <span className="text-muted-foreground italic">无</span>}</div>
                </div>
                <div className="p-2 rounded border border-violet-500/30 bg-violet-500/5 text-xs">
                  <div className="text-violet-600 dark:text-violet-400 mb-0.5">AI 建议</div>
                  <div className="font-medium">{aiInferConfirm.aiCountry || <span className="text-muted-foreground italic">无</span>}</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button className="btn btn-ghost btn-sm" onClick={handleAiInferDismiss}>
                取消
              </button>
              <button
                className="btn btn-sm gap-1.5"
                style={{ background: "var(--violet-600, #7c3aed)", color: "#fff", borderColor: "transparent" }}
                onClick={handleAiInferApply}
              >
                <BrainCircuit size={12} />
                应用 AI 结果
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
