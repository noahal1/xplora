import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEnrich } from "../context/EnrichContext";
import { Sparkles, X } from "lucide-react";
import CountUp from "./CountUp";

/**
 * A slim progress banner displayed at the top of the main app area
 * when background metadata enrichment (poster scraping) is in progress.
 *
 * Includes a dismiss button to stop polling — useful when the server
 * was restarted mid-enrichment leaving stale pending movies in the DB.
 */
export function EnrichBanner() {
  const { t } = useTranslation();
  const { isEnriching, progress, stopPolling } = useEnrich();
  const [visible, setVisible] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "visible" | "exit">("exit");
  const prevEnriching = useRef(false);

  useEffect(() => {
    if (isEnriching && !prevEnriching.current) {
      setVisible(true);
      setAnimState("enter");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState("visible"));
      });
    } else if (!isEnriching && prevEnriching.current) {
      setAnimState("exit");
      const timer = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(timer);
    }
    prevEnriching.current = isEnriching;
  }, [isEnriching]);

  if (!visible) return null;

  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  return (
    <div
      className={`transition-all duration-400 ease-out overflow-hidden ${
        animState === "visible"
          ? "max-h-16 opacity-100 translate-y-0"
          : animState === "enter"
            ? "max-h-0 opacity-0 -translate-y-2"
            : "max-h-0 opacity-0 -translate-y-2"
      }`}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-primary/8 border border-primary/20 mb-3 z-10">
        <Sparkles size={14} className="text-primary shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-primary/80 truncate">
              {progress
                ? `${t("enrich.progress", {
                    enriched: progress.processed,
                    total: progress.total,
                  })}${progress.failed > 0 ? ` (${progress.failed} ${t("enrich.failed")})` : ""}`
                : t("enrich.starting")}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {progress && progress.total > 0 && (
                <span className="text-[10px] font-mono text-primary/60 tabular-nums">
                  <CountUp end={pct} suffix="%" decimals={0} duration={0.5} />
                  {progress.failed > 0 && (
                    <span className="ml-1 text-[10px] text-red-400/70">
                      ⚠{progress.failed}
                    </span>
                  )}
                </span>
              )}
              {/* Dismiss button — stops polling and hides the banner */}
              <button
                onClick={stopPolling}
                className="flex items-center justify-center w-5 h-5 rounded-md text-primary/50 hover:text-primary hover:bg-primary/10 transition-all shrink-0"
                title={t("enrich.dismiss")}
                aria-label={t("enrich.dismiss")}
              >
                <X size={13} />
              </button>
            </div>
          </div>
          {/* Progress bar */}
          {progress && progress.total > 0 && (
            <div className="mt-1 h-1 rounded-full bg-primary/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/50 transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
