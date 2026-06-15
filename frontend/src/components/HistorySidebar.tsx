import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail, DBSession, DBSessionDetail } from "../types";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { useHistory } from "../context/HistoryContext";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Modal } from "./Modal";
import { formatDateTime } from "../utils/date";

type TabType = "movies" | "sessions";

export function HistorySidebar() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { open, setOpen } = useHistory();
  const [tab, setTab] = useState<TabType>("movies");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "movie" | "session"; id: number } | null>(null);

  const PAGE_SIZE = 30;

  const [movies, setMovies] = useState<MediaDetail[]>([]);
  const [movieTotal, setMovieTotal] = useState(0);
  const [moviePage, setMoviePage] = useState(0);
  const [sessions, setSessions] = useState<DBSession[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const [detail, setDetail] = useState<DBSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setDetail(null);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  const loadMovies = useCallback(async (page: number = 0, append: boolean = false) => {
    setLoading(true);
    try {
      const data = await api.listMedia({ page, page_size: PAGE_SIZE });
      if (append) {
        setMovies((prev) => [...prev, ...data.media]);
      } else {
        setMovies(data.media);
      }
      setMovieTotal(data.total);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadSessions = useCallback(async (page: number = 0, append: boolean = false) => {
    setLoading(true);
    try {
      const data = await api.listSessions({ page, page_size: PAGE_SIZE });
      if (append) {
        setSessions((prev) => [...prev, ...data.sessions]);
      } else {
        setSessions(data.sessions);
      }
      setSessionTotal(data.total);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadMoreMovies = useCallback(() => {
    const nextPage = moviePage + 1;
    setMoviePage(nextPage);
    loadMovies(nextPage, true);
  }, [moviePage, loadMovies]);

  const loadMoreSessions = useCallback(() => {
    const nextPage = sessionPage + 1;
    setSessionPage(nextPage);
    loadSessions(nextPage, true);
  }, [sessionPage, loadSessions]);

  const switchTab = useCallback((tabName: TabType) => {
    setTab(tabName);
    setDetail(null);
    setMoviePage(0);
    setSessionPage(0);
    if (tabName === "movies") loadMovies();
    else loadSessions();
  }, [loadMovies, loadSessions]);

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setMoviePage(0);
    setSessionPage(0);
    setTab("movies");
    loadMovies();
  }, [open, loadMovies]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    setDeleteTarget(null);
    try {
      if (type === "movie") {
        await api.deleteMedia(id);
        setMoviePage(0);
        loadMovies();
      } else {
        await api.deleteSession(id);
        setSessionPage(0);
        loadSessions();
      }
      showToast(t("history.deleted"), "success");
    } catch (err: any) {
      showToast(t("history.delete_failed", { message: err.message }), "error");
    }
  }, [deleteTarget, loadMovies, loadSessions, showToast, t]);

  const viewSession = useCallback(async (id: number) => {
    setLoading(true);
    try { const data = await api.getSessionDetail(id); setDetail(data); }
    catch { showToast(t("history.detail_failed"), "error"); }
    finally { setLoading(false); }
  }, [showToast, t]);

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 bg-black/40 z-50 animate-overlay-fade" onClick={close} />}

      {/* Sidebar */}
      <aside className={`fixed top-0 right-0 bottom-0 w-full sm:w-[360px] bg-background border-l border-border z-50 flex flex-col animate-sidebar-slide ${open ? "" : "hidden"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold">{t("history.title")}</h3>
          <button className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors" onClick={close}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 pb-2 shrink-0">
          {(["movies", "sessions"] as const).map((tabName) => (
            <button key={tabName}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                tab === tabName ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              onClick={() => switchTab(tabName)}>
              {tabName === "movies" ? t("history.tab_movies") : t("history.tab_sessions")}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          )}

          {!loading && detail && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="xs" onClick={() => setDetail(null)} className="gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  {t("common.back")}
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2 border-b border-border">
                <span>{detail.model === "deepseek" ? "🧠 DeepSeek" : "🤖 OpenAI"}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span>{t("history.recommendations", { count: detail.recommendations.length })}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span>{t("history.source_movies", { count: detail.source_count })}</span>
              </div>
              <div className="space-y-2">
                {detail.recommendations.map((r, i) => (
                  <div key={i} className="bg-muted/30 border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{r.title}</span>
                      <span className="text-[10px] text-green px-1.5 py-0.5 rounded-full bg-green/10 border border-green/20">
                        {(r.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      {r.year && <span>{r.year}</span>}
                      {r.genre && <Badge variant="outline" className="text-[10px]">{r.genre}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !detail && tab === "movies" && (
            movies.length === 0 ? (
              <div className="empty-state">
                <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
                </svg>
                <p className="text-sm font-medium">{t("history.no_movies")}</p>
                <p className="text-xs mt-1">{t("history.no_movies_hint")}</p>
              </div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground pb-2">{t("history.saved_movies", { count: movieTotal })}</div>
                {movies.map((m) => (
                  <div key={m.id} className="history-item group">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{m.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        ★ {m.rating.toFixed(1)}{m.year && ` · ${m.year}`}
                      </span>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 max-sm:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "movie", id: m.id }); }} title={t("common.delete")}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
                {movies.length < movieTotal && (
                  <button
                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border mt-1"
                    onClick={loadMoreMovies}
                  >
                    {t("history.load_more", { remaining: movieTotal - movies.length })}
                  </button>
                )}
              </>
            )
          )}

          {!loading && !detail && tab === "sessions" && (
            sessions.length === 0 ? (
              <div className="empty-state">
                <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-sm font-medium">{t("history.no_sessions")}</p>
                <p className="text-xs mt-1">{t("history.no_sessions_hint")}</p>
              </div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground pb-2">{t("history.session_count", { count: sessionTotal })}</div>
                {sessions.map((s) => (
                  <div key={s.id} className="history-item group" onClick={() => viewSession(s.id)}>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">
                        {s.model === "deepseek" ? "🧠" : "🤖"} {s.model === "deepseek" ? "DeepSeek" : "OpenAI"} · {t("history.recommendations", { count: s.recommendation_count })}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{formatDateTime(s.created_at)} · {t("history.source_movies", { count: s.source_count })}</span>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 max-sm:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "session", id: s.id }); }} title={t("common.delete")}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
                {sessions.length < sessionTotal && (
                  <button
                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border mt-1"
                    onClick={loadMoreSessions}
                  >
                    {t("history.load_more", { remaining: sessionTotal - sessions.length })}
                  </button>
                )}
              </>
            )
          )}
        </div>
      </aside>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("common.delete")}
        footer={
          <div className="flex items-center gap-2 w-full justify-end">
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </button>
            <button
              className="btn btn-sm"
              style={{ background: "var(--destructive)", color: "#fff", borderColor: "transparent" }}
              onClick={confirmDelete}
            >
              {t("common.delete")}
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {deleteTarget?.type === "session"
            ? t("history.delete_session_confirm")
            : t("history.delete_movie_confirm")}
        </p>
      </Modal>
    </>
  );
}
