import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DBSession, DBSessionDetail, Recommendation, ExternalDetail } from "../types";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { Modal } from "./Modal";
import { Badge } from "./ui/badge";
import { ProgressiveImage } from "./ProgressiveImage";
import { formatDateTime } from "../utils/date";
import { Film, History, Brain, Bot, Trash2, ChevronRight, Percent, Plus, Clock } from "lucide-react";
import { translateGenres, translateGenreName } from "../utils/genre";

const PAGE_SIZE = 20;

export function HistoryTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<DBSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DBSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [resolvedPosters, setResolvedPosters] = useState<Record<number, string | null>>({});
  const [addingToWishlist, setAddingToWishlist] = useState<Record<number, boolean>>({});

  // TMDB detail modal
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const [detailData, setDetailData] = useState<ExternalDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [tmdbLoading, setTmdbLoading] = useState(false);

  const loadSessions = useCallback(async (p: number = 0) => {
    setLoading(true);
    try {
      const data = await api.listSessions({ page: p, page_size: PAGE_SIZE });
      setSessions(data.sessions);
      setTotal(data.total);
      setPage(p);
    } catch {
      showToast(t("history.detail_failed"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    loadSessions(0);
  }, [loadSessions]);

  const viewSession = useCallback(async (id: number) => {
    setDetailLoading(true);
    setDetail(null);
    setResolvedPosters({});
    try {
      const data = await api.getSessionDetail(id);
      setDetail(data);
      // Resolve posters for all recommendations in the background
      const posterMap: Record<number, string | null> = {};
      await Promise.allSettled(
        data.recommendations.map(async (rec, idx) => {
          try {
            const searchData = await api.searchMedia(rec.title, "tmdb");
            const matches = searchData.results ?? [];
            const yearMatch = rec.year
              ? matches.find((m) => m.year === rec.year && m.poster_url)
              : undefined;
            const fallback = matches.find((m) => m.poster_url);
            const match = yearMatch ?? fallback ?? matches[0];
            if (match?.poster_url) posterMap[idx] = match.poster_url;
          } catch { /* ignore */ }
        })
      );
      setResolvedPosters(posterMap);
    } catch {
      showToast(t("history.detail_failed"), "error");
    } finally {
      setDetailLoading(false);
    }
  }, [showToast, t]);

  const confirmDelete = useCallback(async () => {
    if (deleteTarget === null) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.deleteSession(id);
      if (detail?.id === id) setDetail(null);
      showToast(t("history.deleted"), "success");
      loadSessions(page);
    } catch (err: any) {
      showToast(t("history.delete_failed", { message: err.message }), "error");
    }
  }, [deleteTarget, detail, page, loadSessions, showToast, t]);

  const addToWishlist = useCallback(async (rec: Recommendation, idx: number) => {
    if (addingToWishlist[idx]) return;
    setAddingToWishlist((prev) => ({ ...prev, [idx]: true }));
    try {
      await api.addToWishlist({ title: rec.title, year: rec.year, genre: rec.genre || null });
      showToast(t("wishlist.added_to_wishlist", { title: rec.title }), "success");
    } catch (err: any) {
      showToast(t("wishlist.add_failed", { message: err.message }), "error");
    } finally {
      setAddingToWishlist((prev) => ({ ...prev, [idx]: false }));
    }
  }, [addingToWishlist, showToast, t]);

  const openDetail = useCallback(async (rec: Recommendation) => {
    setDetailRec(rec);
    setDetailData(null);
    setDetailError("");
    setTmdbLoading(true);
    try {
      const searchData = await api.searchMedia(rec.title, "tmdb");
      const matches = searchData.results ?? [];
      const yearMatch = rec.year
        ? matches.find((m) => m.year === rec.year)
        : undefined;
      const match = yearMatch ?? matches[0];
      if (match?.source && match?.source_id) {
        const data = await api.getExternalDetail(match.source, match.source_id);
        setDetailData(data);
      } else {
        setDetailError(t("wishlist.search_empty", { query: rec.title }));
      }
    } catch (err: any) {
      setDetailError(err.message);
    } finally {
      setTmdbLoading(false);
    }
  }, [showToast, t]);

  const closeDetail = useCallback(() => {
    setDetailRec(null);
    setDetailData(null);
    setDetailError("");
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // -- Empty state
  if (!loading && sessions.length === 0) {
    return (
      <section className="section-card">
        <div className="empty-state">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}>
            <History size={24} style={{ color: "var(--seed-primary)" }} />
          </div>
          <h2 className="text-heading mb-2" style={{ color: "var(--seed-fg)" }}>
            {t("history.no_sessions")}
          </h2>
          <p className="text-body text-center max-w-md" style={{ color: "var(--fg-muted)" }}>
            {t("history.no_sessions_hint")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      {!detail && (
        <section className="section-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}>
                <History size={18} style={{ color: "var(--seed-primary)" }} />
              </div>
              <div>
                <h2 className="text-heading" style={{ color: "var(--seed-fg)" }}>
                  {t("history.tab_sessions")}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                  {t("history.session_count", { count: total })}
                </p>
              </div>
            </div>
            {total > PAGE_SIZE && (
              <div className="flex items-center gap-1">
                <button className="page-btn" disabled={page <= 0} onClick={() => loadSessions(page - 1)}>‹</button>
                <span className="text-xs px-2" style={{ color: "var(--fg-muted)" }}>{page + 1}/{totalPages}</span>
                <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => loadSessions(page + 1)}>›</button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
        </div>
      )}

      {/* ── Session Detail View ── */}
      {!loading && detail && (
        <section className="section-card">
          {/* Back + session info bar */}
          <div className="flex items-start sm:items-center gap-2 pb-4 mb-5 flex-wrap" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all hover:bg-accent"
              style={{ color: "var(--fg-muted)" }}
              onClick={() => { setDetail(null); setResolvedPosters({}); }}
            >
              <ChevronRight size={14} className="rotate-180" />
              {t("common.back")}
            </button>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-sm font-medium">
                {detail.model === "deepseek" ? "🧠 DeepSeek" : "🤖 OpenAI"}
              </span>
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
              <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                <Clock size={10} className="inline mr-0.5" />
                {formatDateTime(detail.created_at)}
              </span>
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
              <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                {t("history.source_movies", { count: detail.source_count })}
              </span>
              <Badge variant="outline" className="text-[10px] ml-1">
                {t("history.recommendations", { count: detail.recommendations.length })}
              </Badge>
            </div>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {detail.recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="card card-lift p-3.5 flex items-center justify-between animate-slide-up cursor-pointer"
                  style={{ animationDelay: `${i * 0.06}s`, animationFillMode: "both" }}
                  onClick={() => openDetail(rec)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Poster */}
                    <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted/60 flex items-center justify-center border border-border">
                      {resolvedPosters[i] ? (
                        <ProgressiveImage
                          src={resolvedPosters[i]!}
                          alt={rec.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film size={14} style={{ color: "var(--fg-dim)", opacity: 0.5 }} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-[510] truncate" style={{ color: "var(--seed-fg)" }}>
                          {rec.title}
                        </span>
                        {rec.year && (
                          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>{rec.year}</span>
                        )}
                        {rec.genre && (
                          <Badge variant="outline" className="text-[10px]">{translateGenres(rec.genre)}</Badge>
                        )}
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            color: rec.confidence >= 0.7 ? "var(--seed-primary)" : "var(--fg-muted)",
                            background: rec.confidence >= 0.7 ? "var(--accent-glow)" : "var(--bg-input)",
                            border: `1px solid ${rec.confidence >= 0.7 ? "var(--primary-20)" : "var(--border-subtle)"}`,
                          }}
                        >
                          <Percent size={8} />
                          {Math.round(rec.confidence * 100)}
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: "var(--fg-secondary)" }}>
                        {rec.reason}
                      </p>
                    </div>
                  </div>

                  {/* Add to wishlist button */}
                  <button
                    className="btn btn-xs shrink-0 ml-3 transition-all disabled:opacity-50"
                    style={{
                      background: "var(--accent-glow)",
                      color: "var(--seed-primary)",
                      border: "1px solid var(--primary-20)",
                    }}
                    disabled={addingToWishlist[i]}
                    onClick={(e) => { e.stopPropagation(); addToWishlist(rec, i); }}
                    title={t("wishlist.add")}
                  >
                    {addingToWishlist[i] ? (
                      <div className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                    ) : (
                      <Plus size={12} />
                    )}
                    <span className="text-[11px] font-medium">{t("wishlist.add")}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Session List (wishlist-style cards) ── */}
      {!loading && !detail && (
        <>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="card card-lift p-3.5 flex items-center justify-between cursor-pointer group animate-slide-up"
                style={{ animationDelay: `${sessions.indexOf(s) * 0.04}s`, animationFillMode: "both" }}
                onClick={() => viewSession(s.id)}
              >
                <div className="flex items-center gap-3">
                  {/* Model icon */}
                  <div
                    className="w-9 h-[54px] rounded shrink-0 flex items-center justify-center"
                    style={{
                      background: s.model === "deepseek" ? "var(--accent-glow)" : "rgba(16, 185, 129, 0.1)",
                      border: `1px solid ${s.model === "deepseek" ? "var(--primary-20)" : "rgba(16, 185, 129, 0.2)"}`,
                    }}
                  >
                    {s.model === "deepseek" ? (
                      <Brain size={16} style={{ color: "var(--seed-primary)" }} />
                    ) : (
                      <Bot size={16} style={{ color: "#10b981" }} />
                    )}
                  </div>

                  {/* Info */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-[510]">
                        {s.model === "deepseek" ? "DeepSeek" : "OpenAI"}
                      </span>
                      <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
                      <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                        {formatDateTime(s.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                        <span className="font-medium" style={{ color: "var(--seed-primary)" }}>
                          {s.recommendation_count}
                        </span>{" "}
                        {t("history.recommendations", { count: s.recommendation_count })}
                      </span>
                      <span className="text-xs" style={{ color: "var(--fg-dim)" }}>
                        {t("history.source_movies", { count: s.source_count })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Delete button */}
                  <button
                    className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-all opacity-0 group-hover:opacity-100 max-sm:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s.id); }}
                    title={t("common.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={14} style={{ color: "var(--fg-dim)" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-4">
              <button className="page-btn" disabled={page <= 0} onClick={() => loadSessions(page - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) pageNum = i;
                else if (page < 3) pageNum = i;
                else if (page > totalPages - 4) pageNum = totalPages - 7 + i;
                else pageNum = page - 3 + i;
                return (
                  <button key={pageNum} className={`page-btn ${pageNum === page ? "active" : ""}`} onClick={() => loadSessions(pageNum)}>
                    {pageNum + 1}
                  </button>
                );
              })}
              <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => loadSessions(page + 1)}>›</button>
            </div>
          )}
        </>
      )}

      {/* TMDB Detail Modal */}
      <Modal
        open={detailRec !== null}
        onClose={closeDetail}
        title={detailRec?.title || ""}
        description={detailData?.tagline || undefined}
      >
        {tmdbLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            <span className="ml-2 text-sm" style={{ color: "var(--fg-muted)" }}>{t("detail_modal.loading")}</span>
          </div>
        )}
        {detailError && (
          <div className="px-3 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">{detailError}</div>
        )}
        {detailData && !tmdbLoading && !detailError && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full sm:w-[100px] shrink-0">
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
                  {detailData.poster_url ? (
                    <ProgressiveImage src={detailData.poster_url} alt={detailData.title} className="w-full h-full object-cover" />
                  ) : <span className="text-3xl opacity-30">🎬</span>}
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {detailData.year && <span className="text-xs" style={{ color: "var(--fg-muted)" }}>{detailData.year}</span>}
                  {detailData.runtime && <span className="text-xs" style={{ color: "var(--fg-muted)" }}>{Math.floor(detailData.runtime / 60)}h {detailData.runtime % 60}m</span>}
                  {detailData.original_language && <Badge variant="outline" className="text-[9px]">{detailData.original_language.toUpperCase()}</Badge>}
                  <Badge variant="outline" className="text-[9px] font-mono border-primary/30" style={{ color: "var(--seed-primary)" }}>{detailData.source.toUpperCase()}</Badge>
                </div>
                {detailData.genre && (
                  <div className="flex flex-wrap gap-1">
                    {detailData.genre.split(" / ").map((g) => (
                      <Badge key={g} variant="secondary" className="text-[10px]">{translateGenreName(g.trim())}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2.5">
                  {detailData.rating != null && (
                    <div className="flex items-center gap-1">
                      <span style={{ color: "var(--seed-primary)" }}>★</span>
                      <span className="font-semibold text-sm">{Number(detailData.rating).toFixed(1)}</span>
                      {detailData.vote_count != null && <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>({detailData.vote_count})</span>}
                    </div>
                  )}
                  {detailData.ratings && Object.entries(detailData.ratings).map(([key, val]) => (
                    <Badge key={key} variant="outline" className="text-[9px]">{key === "imdb" ? "IMDb" : key === "rotten_tomatoes" ? "🍅" : key === "metacritic" ? "M" : key}: {val}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {detailData.overview && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--fg-muted)" }}>{t("detail_modal.overview")}</h4>
                <p className="text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>{detailData.overview}</p>
              </div>
            )}

            {(detailData.director || detailData.actors || detailData.writer || detailData.awards) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {detailData.director && (
                  <div><h4 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--fg-muted)" }}>{t("detail_modal.director")}</h4><p className="text-sm">{detailData.director}</p></div>
                )}
                {detailData.writer && (
                  <div><h4 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--fg-muted)" }}>{t("detail_modal.writer")}</h4><p className="text-sm">{detailData.writer}</p></div>
                )}
                {detailData.actors && (
                  <div className="col-span-2"><h4 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--fg-muted)" }}>{t("detail_modal.actors")}</h4><p className="text-sm">{detailData.actors}</p></div>
                )}
                {detailData.awards && (
                  <div className="col-span-2"><h4 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--fg-muted)" }}>{t("detail_modal.awards")}</h4><p className="text-sm">{detailData.awards}</p></div>
                )}
              </div>
            )}

            {(detailData.country || detailData.box_office) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--fg-muted)" }}>
                {detailData.country && <span>{t("detail_modal.country")}: {detailData.country}</span>}
                {detailData.box_office && <span>{t("detail_modal.box_office")}: {detailData.box_office}</span>}
              </div>
            )}

            {detailData.homepage && (
              <div>
                <a href={detailData.homepage} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  {t("detail_modal.homepage")}
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete confirmation modal */}
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
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {t("history.delete_session_confirm")}
        </p>
      </Modal>
    </div>
  );
}
