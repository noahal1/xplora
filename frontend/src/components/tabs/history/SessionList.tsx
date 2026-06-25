import { useState, useCallback } from "react";
import type { TFunction } from "i18next";
import type { DBSession } from "../../../types";
import * as api from "../../../api";
import { useToast } from "../../../context/ToastContext";
import { Modal } from "../../Modal";
import FadeContent from "../../FadeContent";
import { History, Brain, Bot, Trash2, ChevronRight, Clock } from "lucide-react";
import { formatDateTime } from "../../../utils/date";
import CountUp from "../../CountUp";

interface SessionListProps {
  sessions: DBSession[];
  total: number;
  page: number;
  loading: boolean;
  totalPages: number;
  onLoadSessions: (page: number) => void;
  onViewSession: (id: number) => void;
  onDeletedSession: (id: number) => void;
  t: TFunction;
}

export function SessionList({
  sessions, total, page, loading, totalPages,
  onLoadSessions, onViewSession, onDeletedSession, t,
}: SessionListProps) {
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const confirmDelete = useCallback(async () => {
    if (deleteTarget === null) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.deleteSession(id);
      showToast(t("history.deleted"), "success");
      onDeletedSession(id);
    } catch (err: any) {
      showToast(t("history.delete_failed", { message: err.message }), "error");
    }
  }, [deleteTarget, onDeletedSession, showToast, t]);

  if (!loading && sessions.length === 0) {
    return (
      <FadeContent className="section-card">
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
      </FadeContent>
    );
  }

  return (
    <>
      <FadeContent className="section-card">
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
          {total > 20 && (
            <div className="flex items-center gap-1">
              <button className="page-btn" disabled={page <= 0} onClick={() => onLoadSessions(page - 1)}>‹</button>
              <span className="text-xs px-2" style={{ color: "var(--fg-muted)" }}>{page + 1}/{totalPages}</span>
              <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => onLoadSessions(page + 1)}>›</button>
            </div>
          )}
        </div>
      </FadeContent>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
        </div>
      )}

      {!loading && (
        <>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="card card-lift p-3.5 flex items-center justify-between cursor-pointer group animate-slide-up"
                style={{ animationDelay: `${sessions.indexOf(s) * 0.04}s`, animationFillMode: "both" }}
                onClick={() => onViewSession(s.id)}
              >
                <div className="flex items-center gap-3">
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
                        {t("history.recommendations", { count: 0 }).replace("0", "")}<CountUp end={s.recommendation_count} />
                      </span>
                      <span className="text-xs" style={{ color: "var(--fg-dim)" }}>
                        {t("history.source_movies", { count: 0 }).replace("0", "")}<CountUp end={s.source_count} />
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-4">
              <button className="page-btn" disabled={page <= 0} onClick={() => onLoadSessions(page - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) pageNum = i;
                else if (page < 3) pageNum = i;
                else if (page > totalPages - 4) pageNum = totalPages - 7 + i;
                else pageNum = page - 3 + i;
                return (
                  <button key={pageNum} className={`page-btn ${pageNum === page ? "active" : ""}`} onClick={() => onLoadSessions(pageNum)}>
                    {pageNum + 1}
                  </button>
                );
              })}
              <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => onLoadSessions(page + 1)}>›</button>
            </div>
          )}
        </>
      )}

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
    </>
  );
}
