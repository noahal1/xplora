import { useTranslation } from "react-i18next";
import { Film, Star, Trophy, ChevronRight, Sparkles } from "lucide-react";
import TiltedCard from "@/components/TiltedCard";
import type { StatsData } from "@/types";

/* ── Top Rated Preview ────────────────────────────────────────── */
export function TopRatedPreview({ movies, onNavigate }: { movies: StatsData["top_rated"]; onNavigate: () => void }) {
  const { t } = useTranslation();
  const topN = movies.slice(0, 5);
  if (topN.length === 0) return null;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-pointer"
      onClick={onNavigate}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--seed-primary) 8%, transparent), transparent 65%)`,
        border: "1px solid color-mix(in srgb, var(--seed-primary) 14%, transparent)",
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl pointer-events-none"
        style={{ background: `radial-gradient(500px circle at 20% 50%, color-mix(in srgb, var(--seed-primary) 8%, transparent), transparent)` }}
      />
      <div className="relative z-10 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--seed-primary) 20%, transparent)" }}>
              <Trophy size={15} style={{ color: "var(--seed-primary)" }} />
            </div>
            <div>
              <span className="text-sm font-semibold" style={{ color: "var(--seed-fg)" }}>
                {t("stats.top_rated", "高分排行榜")}
              </span>
              <span className="text-[10px] ml-2" style={{ color: "var(--fg-muted)" }}>
                <Sparkles size={10} className="inline mr-0.5" style={{ color: "var(--seed-primary)" }} />
                {t("stats.view_top_rated", "浏览 Top 10")}
              </span>
            </div>
          </div>
          <ChevronRight size={15} className="shrink-0 transition-all duration-300 group-hover:translate-x-0.5" style={{ color: "var(--fg-dim)" }} />
        </div>

        {/* Mini grid */}
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {topN.map((movie, i) => (
            <div key={movie.id} className="flex flex-col items-center gap-1.5">
              <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-muted/60 border border-border/40">
                {movie.poster_url ? (
                  <TiltedCard
                    imageSrc={movie.poster_url}
                    altText={movie.title}
                    containerHeight="100%"
                    containerWidth="100%"
                    imageHeight="100%"
                    imageWidth="100%"
                    scaleOnHover={1.02}
                    rotateAmplitude={10}
                    displayOverlayContent
                    overlayContent={
                      <div
                        className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-lg"
                        style={{
                          background: i === 0
                            ? "linear-gradient(135deg, #f59e0b, #eab308)"
                            : i === 1
                              ? "linear-gradient(135deg, #94a3b8, #cbd5e1)"
                              : i === 2
                                ? "linear-gradient(135deg, #d97706, #f59e0b)"
                                : "rgba(0,0,0,0.5)",
                          color: i <= 2 ? "#0f0f0f" : "#fff",
                          backdropFilter: "blur(4px)",
                        }}
                      >
                        {i + 1}
                      </div>
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film size={14} style={{ color: "var(--fg-dim)", opacity: 0.4 }} />
                  </div>
                )}
              </div>
              <div className="text-center min-w-0 w-full px-0.5">
                <p className="text-[10px] font-medium truncate leading-tight" style={{ color: "var(--fg-secondary)" }}>
                  {movie.title}
                </p>
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <Star size={8} style={{ color: "var(--seed-primary)" }} />
                  <span className="text-[9px] font-semibold tabular-nums" style={{ color: "var(--fg-muted)" }}>
                    {movie.rating.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
