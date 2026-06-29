import { useRef, useCallback } from "react";
import type { TFunction } from "i18next";
import { Sparkles } from "lucide-react";
import type { Recommendation } from "../../../types";
import { exportScreenshot } from "../../../utils/export";
import { useToast } from "../../../context/ToastContext";
import { getErrMsg } from "../../../lib/utils";
import FadeContent from "../../FadeContent";
import { RecommendationCard } from "./RecommendationCard";

interface ResultsSectionProps {
  recommendations: Recommendation[];
  modelUsed: string;
  strategy: string;
  sourceInfo: string;
  addingToWishlist: Record<number, boolean>;
  onAddToWishlist: (rec: Recommendation, idx: number) => void;
  onOpenDetail: (rec: Recommendation) => void;
  onNewSession: () => void;
  onExportJSON: () => void;
  t: TFunction;
}

export function ResultsSection({
  recommendations, modelUsed, strategy, sourceInfo,
  addingToWishlist,
  onAddToWishlist, onOpenDetail, onNewSession, onExportJSON, t,
}: ResultsSectionProps) {
  const { showToast } = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleExportScreenshot = useCallback(async () => {
    if (!resultsRef.current) return;
    try {
      await exportScreenshot(resultsRef.current);
      showToast(t("recommend.export_screenshot_success"), "success");
    } catch (err: unknown) { showToast(getErrMsg(err), "error"); }
  }, [showToast, t]);

  return (
    <FadeContent className="section-card" ref={resultsRef}>
      <div className="section-header flex-wrap gap-2 sm:flex-nowrap">
        <h2 className="text-heading" style={{ color: "var(--seed-fg)" }}>
          {t("recommend.results")}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {modelUsed && <span className="badge">{modelUsed}</span>}
          <span className="badge">{t(`recommend.strategy_${strategy}`)}</span>
        </div>
      </div>

      {sourceInfo && (
        <p className="text-center mb-5 pb-4" style={{ color: "var(--fg-muted)", fontSize: "0.8125rem", borderBottom: "1px solid var(--border-subtle)" }}>
          {sourceInfo}
        </p>
      )}

      <div className="space-y-3">
        {recommendations.map((rec, i) => (
          <RecommendationCard
            key={i}
            rec={rec}
            index={i}
            addingToWishlist={!!addingToWishlist[i]}
            onAddToWishlist={() => onAddToWishlist(rec, i)}
            onOpenDetail={() => onOpenDetail(rec)}
            t={t}
          />
        ))}
      </div>

      {/* Export buttons */}
      {recommendations.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button
            onClick={onExportJSON}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{ background: "var(--bg-input)", color: "var(--fg-secondary)", border: "1px solid var(--border-default)" }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {t("recommend.export_json")}
          </button>
          <button
            onClick={handleExportScreenshot}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{ background: "var(--bg-input)", color: "var(--fg-secondary)", border: "1px solid var(--border-default)" }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="12" r="4" /></svg>
            {t("recommend.export_screenshot")}
          </button>
          <button
            onClick={onNewSession}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all sm:ml-auto"
            style={{ color: "var(--fg-muted)" }}
          >
            <Sparkles size={12} />
            {t("recommend.new_session")}
          </button>
        </div>
      )}
    </FadeContent>
  );
}
