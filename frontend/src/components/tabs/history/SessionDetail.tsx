import type { TFunction } from "i18next";
import type { DBSessionDetail, Recommendation } from "../../../types";
import FadeContent from "../../FadeContent";
import { Badge } from "../../ui/badge";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, Brain, Bot, ChevronRight, Percent, Plus, Clock } from "lucide-react";
import CountUp from "../../CountUp";
import { formatDateTime } from "../../../utils/date";
import { translateGenres } from "../../../utils/genre";

interface SessionDetailProps {
  detail: DBSessionDetail;
  loading: boolean;
  resolvedPosters: Record<number, string | null>;
  addingToWishlist: Record<number, boolean>;
  onBack: () => void;
  onAddToWishlist: (rec: Recommendation, idx: number) => void;
  onOpenDetail: (rec: Recommendation) => void;
  t: TFunction;
}

export function SessionDetail({
  detail, loading, resolvedPosters, addingToWishlist,
  onBack, onAddToWishlist, onOpenDetail, t,
}: SessionDetailProps) {
  return (
    <FadeContent className="section-card">
      <div className="flex items-start sm:items-center gap-2 pb-4 mb-5 flex-wrap" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <button
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all hover:bg-accent"
          style={{ color: "var(--fg-muted)" }}
          onClick={onBack}
        >
          <ChevronRight size={14} className="rotate-180" />
          {t("common.back")}
        </button>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm font-medium">
            {detail.model === "deepseek" ? <><Brain size={14} /> DeepSeek</> : <><Bot size={14} /> OpenAI</>}
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
            <Clock size={10} className="inline mr-0.5" />
            {formatDateTime(detail.created_at)}
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: "var(--fg-dim)" }} />
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {t("history.source_movies", { count: 0 }).replace("0", "")}<CountUp end={detail.source_count} />
          </span>
          <Badge variant="outline" className="text-[10px] ml-1">
            {t("history.recommendations", { count: 0 }).replace("0", "")}<CountUp end={detail.recommendations.length} />
          </Badge>
        </div>
      </div>

      {loading ? (
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
              onClick={() => onOpenDetail(rec)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
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
                      <Percent size={8} /><CountUp end={Math.round(rec.confidence * 100)} suffix="%" />
                    </span>
                  </div>
                  <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: "var(--fg-secondary)" }}>
                    {rec.reason}
                  </p>
                </div>
              </div>
              <button
                className="btn btn-xs shrink-0 ml-3 transition-all disabled:opacity-50"
                style={{
                  background: "var(--accent-glow)",
                  color: "var(--seed-primary)",
                  border: "1px solid var(--primary-20)",
                }}
                disabled={addingToWishlist[i]}
                onClick={(e) => { e.stopPropagation(); onAddToWishlist(rec, i); }}
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
    </FadeContent>
  );
}
