import type { TFunction } from "i18next";
import { History, Brain, Bot, Clock, ChevronRight, Trash2, Film, Percent } from "lucide-react";
import type { DBSession, DBSessionDetail, Recommendation } from "../../../types";
import FadeContent from "../../FadeContent";
import { Modal } from "../../Modal";
import { formatDateTime } from "../../../utils/date";
import { translateGenres } from "../../../utils/genre";
import CountUp from "../../CountUp";

interface SessionHistoryProps {
  sessions: DBSession[];
  sessionsTotal: number;
  sessionsPage: number;
  sessionsLoading: boolean;
  selectedSession: DBSessionDetail | null;
  selectedSessionLoading: boolean;
  deleteTargetId: number | null;
  sessionPosterMap: Record<number, string | null>;
  addingFromSession: Record<number, boolean>;
  onLoadSessions: (page: number) => void;
  onViewSession: (id: number) => void;
  onBackToList: () => void;
  onConfirmDeleteSession: () => void;
  onSetDeleteTarget: (id: number | null) => void;
  onAddRecToWishlist: (rec: Recommendation, idx: number) => void;
  onOpenDetail: (rec: Recommendation) => void;
  t: TFunction;
}

export function SessionHistory({
  sessions, sessionsTotal, sessionsPage, sessionsLoading,
  selectedSession, selectedSessionLoading, deleteTargetId,
  sessionPosterMap, addingFromSession,
  onLoadSessions, onViewSession, onBackToList,
  onConfirmDeleteSession, onSetDeleteTarget,
  onAddRecToWishlist, onOpenDetail, t,
}: SessionHistoryProps) {
  return (
    <>
      {/* === Session List === */}
      {!selectedSession && (
        <FadeContent className="section-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}
              >
                <History size={15} className="text-primary" />
              </div>
              <h2 className="text-sm font-[590] text-foreground">
                {t("history.title")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("history.session_count", { count: sessionsTotal })}
              </span>
            </div>
            {sessionsTotal > 10 && (
              <div className="flex items-center gap-1">
                <button className="page-btn" disabled={sessionsPage <= 0} onClick={() => onLoadSessions(sessionsPage - 1)}>‹</button>
                <span className="text-xs px-1 text-muted-foreground">{sessionsPage + 1}/{Math.ceil(sessionsTotal / 10)}</span>
                <button className="page-btn" disabled={sessionsPage >= Math.ceil(sessionsTotal / 10) - 1} onClick={() => onLoadSessions(sessionsPage + 1)}>›</button>
              </div>
            )}
          </div>

          {sessionsLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          )}

          {!sessionsLoading && sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <History size={20} className="opacity-30 mb-2" />
              <p className="text-xs">{t("history.no_sessions_hint")}</p>
            </div>
          )}

          {!sessionsLoading && sessions.length > 0 && (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="card card-lift p-3 flex items-center justify-between cursor-pointer"
                  onClick={() => onViewSession(s.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-12 rounded shrink-0 flex items-center justify-center"
                      style={{
                        background: s.model === "deepseek" ? "var(--accent-glow)" : "rgba(16, 185, 129, 0.1)",
                        border: `1px solid ${s.model === "deepseek" ? "var(--primary-20)" : "rgba(16, 185, 129, 0.2)"}`,
                      }}
                    >
                      {s.model === "deepseek" ? (
                        <Brain size={14} className="text-primary" />
                      ) : (
                        <Bot size={14} style={{ color: "#10b981" }} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-[510]">
                          {s.model === "deepseek" ? "DeepSeek" : "OpenAI"}
                        </span>
                        <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
                        <span className="text-xs text-muted-foreground">
                          <Clock size={10} className="inline mr-0.5" />
                          {formatDateTime(s.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-primary">{s.recommendation_count}</span>
                          {' '}{t("history.recommendations", { count: s.recommendation_count })}
                        </span>
                        <span className="text-xs text-fg-dim">
                          {t("history.source_movies", { count: s.source_count })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-all opacity-0 group-hover:opacity-100 max-sm:opacity-100"
                      onClick={(e) => { e.stopPropagation(); onSetDeleteTarget(s.id); }}
                      title={t("common.delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                    <ChevronRight size={14} className="text-fg-dim" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </FadeContent>
      )}

      {/* === Session Detail View === */}
      {selectedSession && (
        <FadeContent className="section-card">
          {/* Back + session info */}
          <div className="flex items-start sm:items-center gap-2 pb-4 mb-4 flex-wrap" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all hover:bg-accent text-muted-foreground"
              onClick={onBackToList}
            >
              <ChevronRight size={14} className="rotate-180" />
              {t("common.back")}
            </button>
            <div className="flex items-center gap-2 ml-2 flex-wrap">
              <span className="text-sm font-medium">
                {selectedSession.model === "deepseek" ? <><Brain size={14} className="inline mr-1" />DeepSeek</> : <><Bot size={14} className="inline mr-1" />OpenAI</>}
              </span>
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
              <span className="text-xs text-muted-foreground">
                <Clock size={10} className="inline mr-0.5" />
                {formatDateTime(selectedSession.created_at)}
              </span>
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
              <span className="text-xs text-muted-foreground">
                {t("history.source_movies", { count: selectedSession.source_count })}
              </span>
            </div>
          </div>

          {selectedSessionLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {selectedSession.recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="card card-lift p-3.5 flex items-center justify-between cursor-pointer animate-slide-up"
                  style={{ animationDelay: `${i * 0.06}s`, animationFillMode: "both" }}
                  onClick={() => onOpenDetail(rec)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted/60 flex items-center justify-center border border-border">
                      {sessionPosterMap[i] ? (
                        <img src={sessionPosterMap[i]!} alt={rec.title} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <Film size={14} className="opacity-40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-[510] truncate text-foreground">{rec.title}</span>
                        {rec.year && <span className="text-xs text-muted-foreground">{rec.year}</span>}
                        {rec.genre && <span className="badge text-[10px]">{translateGenres(rec.genre)}</span>}
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            color: rec.confidence >= 0.7 ? "var(--seed-primary)" : "var(--fg-muted)",
                            background: rec.confidence >= 0.7 ? "var(--accent-glow)" : "var(--bg-input)",
                            border: `1px solid ${rec.confidence >= 0.7 ? "var(--primary-20)" : "var(--border-subtle)"}`,
                          }}
                        >
                          <Percent size={8} /><CountUp end={Math.round(rec.confidence * 100)} suffix="%" />
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed line-clamp-2 text-fg-secondary">{rec.reason}</p>
                    </div>
                  </div>
                  <button
                    className="btn btn-xs shrink-0 ml-3 transition-all disabled:opacity-50"
                    style={{
                      background: "var(--accent-glow)",
                      color: "var(--seed-primary)",
                      border: "1px solid var(--primary-20)",
                    }}
                    disabled={addingFromSession[i]}
                    onClick={(e) => { e.stopPropagation(); onAddRecToWishlist(rec, i); }}
                    title={t("wishlist.add")}
                  >
                    {addingFromSession[i] ? (
                      <div className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                    <span className="text-[11px] font-medium">{t("wishlist.add")}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </FadeContent>
      )}

      {/* Delete Session Confirmation Modal */}
      <Modal
        open={deleteTargetId !== null}
        onClose={() => onSetDeleteTarget(null)}
        title={t("common.delete")}
        footer={
          <div className="flex items-center gap-2 w-full justify-end">
            <button className="btn btn-ghost btn-sm" onClick={() => onSetDeleteTarget(null)}>
              {t("common.cancel")}
            </button>
            <button
              className="btn btn-sm"
              style={{ background: "var(--destructive)", color: "#fff", borderColor: "transparent" }}
              onClick={onConfirmDeleteSession}
            >
              {t("common.delete")}
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t("history.delete_session_confirm")}
        </p>
      </Modal>
    </>
  );
}
