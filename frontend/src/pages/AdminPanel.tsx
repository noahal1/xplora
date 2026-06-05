import { useState, useEffect, type FormEvent } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { exportAllData, adminDeleteUser, adminResetPassword, listOperationLogs } from "../api";
import { Modal } from "../components/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { formatDate, formatDateTime } from "../utils/date";
import { Pagination } from "../components/Pagination";

const LOG_PAGE_SIZE = 30;

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

  // ── Logs ───────────────────────────────────────────────────────
  const [logs, setLogs] = useState<Array<{ id: number; user_id: number; username: string; action: string; detail: string | null; created_at: string }>>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("users");

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
    } catch (err: any) {
      showToast(err.message, "error");
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
    } catch (err: any) {
      showToast(err.message, "error");
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
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setResetting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAllData();
      showToast(t("admin.export_success"), "success");
    } catch (err: any) {
      showToast(t("admin.export_failed"), "error");
    } finally {
      setExporting(false);
    }
  };

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {t("admin.tab_users")}
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            {t("admin.tab_logs")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6 mt-6">
          {/* Create User Form */}
          <section className="section-card">
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
          </section>

          {/* Users List */}
          <section className="section-card">
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
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => { setResetTarget(u); setResetPassword(""); }} className="btn btn-ghost btn-xs" title={t("admin.reset_pwd")}>{t("admin.reset_pwd")}</button>
                          <button onClick={() => setDeleteConfirm(u)} className="btn btn-ghost btn-xs text-destructive hover:text-destructive hover:bg-destructive/10" title={t("admin.delete_user")}>{t("admin.delete_user")}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <section className="section-card">
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
                          <td className="px-2 py-2.5 text-xs">{log.username}</td>
                          <td className="px-2 py-2.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-foreground">
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
          </section>
        </TabsContent>
      </Tabs>

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
