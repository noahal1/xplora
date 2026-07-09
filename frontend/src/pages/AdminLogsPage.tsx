import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { listOperationLogs } from "../api";
import { useNavigate } from "react-router-dom";
import { formatDateTime } from "../utils/date";
import FadeContent from "../components/FadeContent";
import { Pagination } from "../components/Pagination";

const LOG_PAGE_SIZE = 30;

export function AdminLogsPage() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
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
    setLogsPage(0);
    loadLogs(0);
  }, []);

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
          <h1 className="text-lg font-semibold tracking-tight">{t("admin.tab_logs")}</h1>
        </div>
        <button
          onClick={logout}
          className="btn btn-ghost btn-sm text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {t("admin.logout")}
        </button>
      </div>

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
      </FadeContent>
    </div>
  );
}
