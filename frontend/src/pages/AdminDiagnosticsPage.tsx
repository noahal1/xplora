import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { getMediaDiagnostics, enrichAllMedia } from "../api";
import { getErrMsg } from "../lib/utils";
import { useNavigate } from "react-router-dom";
import FadeContent from "../components/FadeContent";
import { Pagination } from "../components/Pagination";
import { AlertTriangle, Image, FileText, User, Clock, Hash, MapPin, Quote, Search, CheckCircle, XCircle } from "lucide-react";

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
  created_at: string;
}

interface DiagData {
  summary: {
    total: number;
    healthy: number;
    has_issues: number;
    missing_poster_url: number;
    missing_overview: number;
    missing_director: number;
    missing_actors: number;
    missing_runtime: number;
    missing_tmdb_id: number;
    missing_country: number;
    missing_tagline: number;
    has_scrape_error: number;
  };
  items: DiagItem[];
}

const DIAG_PAGE_SIZE = 20;

const FILTER_OPTIONS = [
  { value: "all", label: "全部", icon: null },
  { value: "poster_url", label: "海报", icon: "Image" },
  { value: "overview", label: "简介", icon: "FileText" },
  { value: "director", label: "导演", icon: "User" },
  { value: "actors", label: "演员", icon: "User" },
  { value: "runtime", label: "时长", icon: "Clock" },
  { value: "tmdb_id", label: "TMDB ID", icon: "Hash" },
  { value: "country", label: "国家", icon: "MapPin" },
  { value: "tagline", label: "标语", icon: "Quote" },
  { value: "scrape_error", label: "刮削异常", icon: "XCircle" },
];

export function AdminDiagnosticsPage() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [diagData, setDiagData] = useState<DiagData | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [diagFilter, setDiagFilter] = useState<string>("all");
  const [diagPage, setDiagPage] = useState(0);

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
    <div className="max-w-3xl mx-auto px-4 sm:px-5 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
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
        <button
          onClick={logout}
          className="btn btn-ghost btn-sm text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          退出登录
        </button>
      </div>

      <FadeContent className="section-card">
        <div className="section-header">
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
            {/* ── Summary Cards ─────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CheckCircle size={16} className="text-primary" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.healthy}</div>
                  <div className="text-[10px] text-muted-foreground">正常 / {diagData.summary.total}</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} className="text-destructive" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.has_issues}</div>
                  <div className="text-[10px] text-muted-foreground">有问题的条目</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Image size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_poster_url}</div>
                  <div className="text-[10px] text-muted-foreground">缺失海报</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_overview}</div>
                  <div className="text-[10px] text-muted-foreground">缺失简介</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <User size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_director}</div>
                  <div className="text-[10px] text-muted-foreground">缺失导演</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <User size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_actors}</div>
                  <div className="text-[10px] text-muted-foreground">缺失演员</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_runtime}</div>
                  <div className="text-[10px] text-muted-foreground">缺失时长</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Hash size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_tmdb_id}</div>
                  <div className="text-[10px] text-muted-foreground">缺失 TMDB ID</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_country}</div>
                  <div className="text-[10px] text-muted-foreground">缺失国家</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Quote size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.missing_tagline}</div>
                  <div className="text-[10px] text-muted-foreground">缺失标语</div>
                </div>
              </div>

              <div className="card p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <XCircle size={16} className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{diagData.summary.has_scrape_error}</div>
                  <div className="text-[10px] text-muted-foreground">刮削异常</div>
                </div>
              </div>
            </div>

            {/* ── Filter Buttons ──────────────────────────── */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setDiagFilter(opt.value); setDiagPage(0); }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
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

            {/* ── Issues Table ──────────────────────────────── */}
            {filteredItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-destructive" />
                  详细问题列表
                  <span className="text-muted-foreground font-normal">
                    ({filteredItems.length}{diagFilter !== "all" ? ` / ${diagData.items.length}` : ""} 项)
                  </span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium">标题</th>
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-16">类型</th>
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-16">状态</th>
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium">缺失字段</th>
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium">刮削错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((item) => (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
                          <td className="px-2 py-2.5">
                            <span className="font-medium text-xs">{item.title}</span>
                            {item.year && <span className="text-[10px] text-muted-foreground ml-1.5">({item.year})</span>}
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              item.media_type === "tv" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            }`}>
                              {item.media_type === "tv" ? "剧集" : "电影"}
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
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
                              <span className="text-[10px] text-red-500/80 block max-w-[200px] truncate" title={item.scrape_error}>
                                <XCircle size={10} className="inline mr-0.5" />
                                {item.scrape_error}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
          </div>
        ) : (
          <div className="text-center py-12 text-sm text-muted-foreground">
            点击「刷新」按钮开始诊断
          </div>
        )}
      </FadeContent>
    </div>
  );
}
