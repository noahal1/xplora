import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { exportAllData, adminDeleteUser, adminResetPassword, listOperationLogs, getMediaDiagnostics, enrichAllMedia } from "../api";
import { Modal } from "../components/Modal";
import { Tabs, TabsContent } from "../components/ui/tabs";
import { getErrMsg } from "../lib/utils";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDate, formatDateTime } from "../utils/date";
import FadeContent from "../components/FadeContent";
import { Pagination } from "../components/Pagination";
import { Sparkles, AlertTriangle, Image, FileText, User, Clock, Hash, MapPin, Search, CheckCircle, XCircle } from "lucide-react";

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
    missing_runtime: number;
    missing_tmdb_id: number;
    missing_country: number;
    has_scrape_error: number;
  };
  items: DiagItem[];
}

const LOG_PAGE_SIZE = 30;
const DIAG_PAGE_SIZE = 20;

interface UserInfo {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export function AdminPanel() {
  const { t } = useTranslation();
  const { token, user: currentUser, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<UserInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab] = useState(
    () => searchParams.get("tab") || "users"
  );
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".user-menu-dropdown")) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Diagnostics ────────────────────────────────────────────────
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

  const FILTER_OPTIONS = [
    { value: "all", label: "全部", icon: null },
    { value: "poster_url", label: "海报", icon: "Image" },
    { value: "overview", label: "简介", icon: "FileText" },
    { value: "runtime", label: "时长", icon: "Clock" },
    { value: "tmdb_id", label: "TMDB ID", icon: "Hash" },
    { value: "country", label: "国家", icon: "MapPin" },
    { value: "scrape_error", label: "刮削异常", icon: "XCircle" },
  ];

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
      // Refresh diagnostics after a short delay to reflect new state
      setTimeout(loadDiagnostics, 2000);
    } catch (err) {
      showToast("批量刮削失败: " + getErrMsg(err), "error");
    } finally {
      setEnriching(false);
    }
  };

  useEffect(() => {
    if (activeTab === "diagnostics") loadDiagnostics();
  }, [activeTab]);

  // ── Logs ───────────────────────────────────────────────────────
  const [logs, setLogs] = useState<Array<{ id: number; user_id: number; username: string; action: string; detail: string | null; created_at: string }>>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadLogs = async (page: number = 0) => {
    setLogsLoading(true);
    try {
      const data = await listOperationLogs({ page, page_size: LOG_PAGE_SIZE });
      setLogs(data.logs);
      setLogsTotal(data.total);
    } catch {
      showToast(t("admin.logs_load_failed"), "error");
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "logs") {
      setLogsPage(0);
      loadLogs(0);
    }
  }, [activeTab]);

  const actionLabels: Record<string, string> = {
    login: "登录",
    search: "搜索",
    replace_watched: "替换已看",
    replace_wishlist: "替换想看",
    add_to_wishlist: "添加到想看",
    mark_watched: "标记已看",
    update_movie: "更新电影",
    delete_movie: "删除电影",
    batch_delete_movies: "批量删除",
    clear_all_movies: "清空全部",
    clear_wishlist: "清空想看",
    enrich_all: "批量刮削",
    cache_posters: "缓存海报",
    rematch_movie: "手动匹配",
    change_password: "修改密码",
    admin_create_user: "创建用户",
    admin_delete_user: "删除用户",
    admin_reset_password: "重置密码",
    update_config: "更新配置",
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      showToast(t("admin.load_failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      showToast(t("admin.create_failed"), "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: t("admin.create_failed") }));
        throw new Error(err.detail || t("admin.create_failed"));
      }
      showToast(t("admin.created", { username: newUsername.trim() }), "success");
      setNewUsername("");
      setNewPassword("");
      loadUsers();
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await adminDeleteUser(deleteConfirm.id);
      showToast(t("admin.user_deleted", { username: deleteConfirm.username }), "success");
      setDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (resetPassword.length < 4) {
      showToast(t("admin.pwd_too_short"), "error");
      return;
    }
    setResetting(true);
    try {
      await adminResetPassword(resetTarget.id, resetPassword);
      showToast(t("admin.pwd_reset", { username: resetTarget.username }), "success");
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setResetting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAllData();
      showToast(t("admin.export_success"), "success");
    } catch (err) {
      showToast(t("admin.export_failed"), "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6">
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
          <h1 className="text-lg font-semibold tracking-tight">{t("admin.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-ghost btn-sm"
          >
            <svg className={`w-3.5 h-3.5 ${exporting ? "animate-stream-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t("admin.export")}
          </button>
          <button
            onClick={logout}
            className="btn btn-ghost btn-sm text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {t("admin.logout")}
          </button>
        </div>
      </div>

      {activeTab === "users" && (<Tabs value="users"><TabsContent value="users" className="space-y-6">
          {/* Create User Form */}
          <FadeContent className="section-card">
            <div className="section-header">
              <h2 className="section-title flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                {t("admin.add_user")}
              </h2>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-end gap-2.5">
              <div className="flex-1 w-full">
                <label className="block text-xs text-muted-foreground mb-1.5">{t("admin.username")}</label>
                <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder={t("admin.username_placeholder")} className="input-field w-full h-9 text-sm" />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs text-muted-foreground mb-1.5">{t("admin.password")}</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("admin.password_placeholder")} className="input-field w-full h-9 text-sm" />
              </div>
              <button type="submit" disabled={creating} className="btn btn-primary h-9">
                {creating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-stream-spin" />
                    {t("admin.creating")}
                  </span>
                ) : t("admin.create")}
              </button>
            </form>
          </FadeContent>

          {/* Users List */}
          <FadeContent className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                {t("admin.user_list")}
                <span className="text-muted-foreground font-normal ml-1.5">({users.length})</span>
              </h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">{t("admin.no_users")}</div>
            ) : (
              <div className="space-y-1.5">
                {users.map((u) => {
                  const isMe = currentUser?.id === u.id;
                  return (
                    <div key={u.id} className="card p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${u.is_admin ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-accent text-accent-foreground"}`}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{u.username}</span>
                            {u.is_admin && <span className="badge text-[10px]">{t("admin.admin_badge")}</span>}
                            {isMe && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground font-medium">{t("admin.current_badge")}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground">{t("admin.created_at", { date: formatDate(u.created_at) })}</span>
                        </div>
                      </div>
                      {!isMe && (
                        <div className="relative shrink-0 user-menu-dropdown">
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === u.id ? null : u.id); }}
                            className="btn btn-ghost btn-xs px-1"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                          {menuOpenId === u.id && (
                            <div className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg border border-border bg-popover shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                              <button
                                onClick={() => { setResetTarget(u); setResetPassword(""); setMenuOpenId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                {t("admin.reset_pwd")}
                              </button>
                              <button
                                onClick={() => { setDeleteConfirm(u); setMenuOpenId(null); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                {t("admin.delete_user")}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </FadeContent>
        </TabsContent></Tabs>)}

      {activeTab === "logs" && (<Tabs value="logs"><TabsContent value="logs" className="">
          <FadeContent className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                {t("admin.logs_title")}
                <span className="text-muted-foreground font-normal ml-1.5">({logsTotal})</span>
              </h2>
            </div>
            {logsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">{t("admin.logs_empty")}</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-16">{t("admin.logs_col_time")}</th>
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-20">{t("admin.logs_col_user")}</th>
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium w-24">{t("admin.logs_col_action")}</th>
                        <th className="text-left px-2 py-2 text-xs text-muted-foreground font-medium">{t("admin.logs_col_detail")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
                          <td className="px-2 py-2.5 text-xs text-muted-foreground whitespace-nowrap tabular-nums">{formatDateTime(log.created_at)}</td>
                          <td className="px-2 py-2.5 text-xs whitespace-nowrap">{log.username}</td>
                          <td className="px-2 py-2.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-foreground whitespace-nowrap">
                              {actionLabels[log.action] || log.action}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-xs text-muted-foreground truncate max-w-[300px]">{log.detail || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={logsPage}
                  totalPages={Math.ceil(logsTotal / LOG_PAGE_SIZE)}
                  onPageChange={(p) => { setLogsPage(p); loadLogs(p); }}
                  info={`${logsPage * LOG_PAGE_SIZE + 1}–${Math.min((logsPage + 1) * LOG_PAGE_SIZE, logsTotal)} / ${logsTotal}`}
                />
              </>
            )}
          </FadeContent>
        </TabsContent></Tabs>)}

      {activeTab === "diagnostics" && (<Tabs value="diagnostics"><TabsContent value="diagnostics" className="">
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
        </TabsContent></Tabs>)}

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={t("admin.delete_confirm_title")}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="admin.delete_confirm_text"
              values={{ username: deleteConfirm?.username ?? "" }}
              components={{ strong: <strong className="text-foreground font-semibold" /> }}
            />
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="btn btn-ghost btn-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn btn-sm"
              style={{ background: 'var(--destructive)', color: '#fff', borderColor: 'transparent' }}
            >
              {deleting ? t("admin.delete_progress") : t("admin.confirm_delete")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={t("admin.reset_pwd_title", { username: resetTarget?.username || "" })}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              {t("admin.new_password")}
            </label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder={t("admin.new_password_placeholder")}
              className="input-field w-full h-9 text-sm"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={() => setResetTarget(null)}
              className="btn btn-ghost btn-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleResetPassword}
              disabled={resetting || resetPassword.length < 4}
              className="btn btn-primary btn-sm"
            >
              {resetting ? t("admin.reset_progress") : t("admin.confirm_reset")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
