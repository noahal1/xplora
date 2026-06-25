import type { TFunction } from "i18next";
import { Percent, Plus, Loader2, Film } from "lucide-react";
import type { Recommendation } from "../../../types";
import { Badge } from "../../ui/badge";
import { translateGenres } from "../../../utils/genre";
import CountUp from "../../CountUp";

interface RecommendationCardProps {
  rec: Recommendation;
  index: number;
  addingToWishlist: boolean;
  onAddToWishlist: () => void;
  onOpenDetail: () => void;
  t: TFunction;
}

export function RecommendationCard({
  rec, index, addingToWishlist, onAddToWishlist, onOpenDetail, t,
}: RecommendationCardProps) {
  return (
    <div
      className="card p-4 animate-slide-up"
      style={{ animationDelay: `${index * 0.1}s`, animationFillMode: "both" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 flex-1 min-w-0">
          {/* Poster — click for details */}
          <div
            className="w-10 h-14 rounded shrink-0 flex items-center justify-center overflow-hidden cursor-pointer ring-1 ring-transparent hover:ring-[var(--seed-primary)] transition-all duration-200"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}
            onClick={onOpenDetail} title={t("recommend.view_detail")}
          >
            {rec.poster_url ? (
              <img src={rec.poster_url} alt={rec.title} className="w-full h-full object-cover" loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <>
                <svg width="40" height="56" viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="56" fill="transparent" />
                  <rect x="3" y="3" width="34" height="50" rx="2" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                  <path d="M20 22L25 28H15L20 22Z" fill="rgba(255,255,255,0.08)" />
                  <circle cx="17" cy="19" r="2.5" fill="rgba(255,255,255,0.06)" />
                  <rect x="9" y="38" width="22" height="2.5" rx="1.25" fill="rgba(255,255,255,0.05)" />
                  <rect x="12" y="43" width="16" height="1.5" rx="0.75" fill="rgba(255,255,255,0.03)" />
                </svg>
                <Film size={12} style={{ color: "var(--fg-dim)", opacity: 0.5, position: "relative", zIndex: 1 }} />
              </>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-[590] truncate" style={{ color: "var(--seed-fg)" }}>
                {rec.title}
              </p>
              {rec.media_type === "tv" && (
                <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
              )}
              {rec.watched && (
                <Badge variant="outline" className="text-[10px] shrink-0" style={{ color: "var(--fg-muted)", borderColor: "var(--border-default)" }}>
                  {t("common.watched")}
                </Badge>
              )}
              {rec.genre && <span className="badge">{translateGenres(rec.genre)}</span>}
            </div>
            {rec.year && (
              <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>{rec.year}</p>
            )}
            <p className="text-body mt-2" style={{ color: "var(--fg-secondary)", fontSize: "0.8125rem" }}>
              {rec.reason}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Add to wishlist button */}
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-all disabled:opacity-50 hover:bg-accent"
            style={{ color: addingToWishlist ? "var(--seed-primary)" : "var(--fg-dim)" }}
            disabled={addingToWishlist}
            onClick={(e) => { e.stopPropagation(); onAddToWishlist(); }}
            title={t("wishlist.add")}
          >
            {addingToWishlist ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
          </button>
          <div className="flex items-center gap-1">
            <Percent size={11} style={{ color: "var(--seed-primary)" }} />
            <span className="text-xs font-[590]" style={{ color: "var(--seed-primary)" }}>
              <CountUp end={Math.round(rec.confidence * 100)} suffix="%" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
