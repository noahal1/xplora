import type { TFunction } from "i18next";
import { Film } from "lucide-react";
import type { ExternalDetail } from "../../types";
import { Modal } from "../Modal";
import { Badge } from "../ui/badge";
import { ProgressiveImage } from "../ProgressiveImage";
import CountUp from "../CountUp";
import { translateGenreName } from "../../utils/genre";

interface TMDBDetailModalProps {
  open: boolean;
  title?: string;
  loading: boolean;
  error: string;
  data: ExternalDetail | null;
  /** Optional recommendation to show confidence bar + AI reason */
  recommendation?: {
    confidence: number;
    reason: string;
  } | null;
  /** Shows TV badge in title when "tv" */
  mediaType?: string;
  /** Optional tagline shown as modal description */
  tagline?: string;
  onClose: () => void;
  t: TFunction;
}

export function TMDBDetailModal({
  open, title, loading, error, data,
  recommendation, mediaType, tagline,
  onClose, t,
}: TMDBDetailModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="truncate">{title || ""}</span>
          {mediaType === "tv" && (
            <Badge
              variant="outline"
              className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0"
            >
              TV
            </Badge>
          )}
        </div>
      }
      description={tagline || undefined}
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          <span className="ml-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            {t("detail_modal.loading")}
          </span>
        </div>
      )}

      {error && (
        <div className="px-3 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {data && !loading && !error && (
        <div className="space-y-5">
          {/* Header: poster + metadata */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="w-[72px] sm:w-[100px] shrink-0">
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
                {data.poster_url ? (
                  <ProgressiveImage
                    src={data.poster_url}
                    alt={data.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Film size={24} className="opacity-30" />
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {/* Year / Runtime / Language / Source */}
              <div className="flex items-center gap-2 flex-wrap">
                {data.year && (
                  <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                    {data.year}
                  </span>
                )}
                {data.runtime != null && (
                  <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                    {Math.floor(data.runtime / 60)}h {data.runtime % 60}m
                  </span>
                )}
                {data.original_language && (
                  <Badge variant="outline" className="text-[9px]">
                    {data.original_language.toUpperCase()}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono border-primary/30"
                  style={{ color: "var(--seed-primary)" }}
                >
                  {data.source.toUpperCase()}
                </Badge>
              </div>

              {/* Genre badges */}
              {data.genre && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(
                    new Set(data.genre.split(" / ").map((g) => g.trim()).filter(Boolean))
                  ).map((g) => (
                    <Badge key={g} variant="secondary" className="text-[10px]">
                      {translateGenreName(g)}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Ratings */}
              <div className="flex flex-wrap items-center gap-2.5">
                {data.rating != null && (
                  <div className="flex items-center gap-1">
                    <span style={{ color: "var(--seed-primary)" }}>★</span>
                    <span className="font-semibold text-sm">
                      {Number(data.rating).toFixed(1)}
                    </span>
                    {data.vote_count != null && (
                      <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                        ({data.vote_count})
                      </span>
                    )}
                  </div>
                )}
                {data.ratings &&
                  Object.entries(data.ratings).map(([key, val]) => (
                    <Badge key={key} variant="outline" className="text-[9px]">
                      {key === "imdb"
                        ? "IMDb"
                        : key === "rotten_tomatoes"
                          ? "RT"
                          : key === "metacritic"
                            ? "M"
                            : key}
                      : {val}
                    </Badge>
                  ))}
              </div>

              {/* Confidence bar (from AI recommendation) */}
              {recommendation && (
                <div className="pt-2 mt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-input)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.round(recommendation.confidence * 100)}%`,
                          background:
                            recommendation.confidence >= 0.8
                              ? "var(--seed-primary)"
                              : recommendation.confidence >= 0.5
                                ? "#f59e0b"
                                : "var(--fg-dim)",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-[590] tabular-nums shrink-0"
                      style={{ color: "var(--seed-primary)" }}
                    >
                      <CountUp end={Math.round(recommendation.confidence * 100)} suffix="%" />
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                    {recommendation.reason}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Overview */}
          {data.overview && (
            <div>
              <h4
                className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--fg-muted)" }}
              >
                {t("detail_modal.overview")}
              </h4>
              <p className="text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                {data.overview}
              </p>
            </div>
          )}

          {/* Credits */}
          {(data.director || data.actors || data.writer) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.director && (
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--fg-muted)" }}>
                    {t("detail_modal.director")}
                  </h4>
                  <p className="text-sm">{data.director}</p>
                </div>
              )}
              {data.writer && (
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--fg-muted)" }}>
                    {t("detail_modal.writer")}
                  </h4>
                  <p className="text-sm">{data.writer}</p>
                </div>
              )}
              {data.actors && (
                <div className="col-span-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--fg-muted)" }}>
                    {t("detail_modal.actors")}
                  </h4>
                  <p className="text-sm">{data.actors}</p>
                </div>
              )}
            </div>
          )}

          {/* Country + Box office */}
          {(data.country || data.box_office) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--fg-muted)" }}>
              {data.country && <span>{t("detail_modal.country")}: {data.country}</span>}
              {data.box_office && <span>{t("detail_modal.box_office")}: {data.box_office}</span>}
            </div>
          )}

          {/* Homepage */}
          {data.homepage && (
            <div>
              <a
                href={data.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                {t("detail_modal.homepage")}
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
