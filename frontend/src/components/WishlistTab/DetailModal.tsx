import { useTranslation } from "react-i18next";
import type { MovieSearchResult, MovieDetail } from "../../types";
import { Badge } from "../ui/badge";
import { Modal } from "../Modal";
import { ProgressiveImage } from "../ProgressiveImage";
import { translateGenreName } from "../../utils/genre";
import { Film } from "lucide-react";

interface DetailModalProps {
  open: boolean;
  movie: MovieSearchResult | null;
  detailData: MovieDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}

export function WishlistDetailModal({ open, movie, detailData, loading, error, onClose }: DetailModalProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose}
      title={movie?.title || ""}
      description={detailData?.tagline || undefined}
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          <span className="ml-2 text-sm text-muted-foreground">{t("detail_modal.loading")}</span>
        </div>
      )}
      {error && (
        <div className="px-3 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
      )}
      {detailData && !loading && !error && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-[100px] shrink-0">
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
                {detailData.poster_url ? (
                  <ProgressiveImage src={detailData.poster_url} alt={detailData.title} className="w-full h-full object-cover" />
                ) : <Film size={24} className="opacity-30" />}
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {detailData.year && <span className="text-xs text-muted-foreground">{detailData.year}</span>}
                {detailData.runtime && <span className="text-xs text-muted-foreground">{Math.floor(detailData.runtime / 60)}h {detailData.runtime % 60}m</span>}
                {detailData.original_language && <Badge variant="outline" className="text-[9px]">{detailData.original_language.toUpperCase()}</Badge>}
                <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary/70">{detailData.source.toUpperCase()}</Badge>
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
                    <span className="text-amber text-sm">★</span>
                    <span className="font-semibold text-sm">{Number(detailData.rating).toFixed(1)}</span>
                    {detailData.vote_count != null && <span className="text-[10px] text-muted-foreground">({detailData.vote_count})</span>}
                  </div>
                )}
                {detailData.ratings && Object.entries(detailData.ratings).map(([key, val]) => (
                  <Badge key={key} variant="outline" className="text-[9px]">{key === "imdb" ? "IMDb" : key === "rotten_tomatoes" ? "RT" : key === "metacritic" ? "M" : key}: {val}</Badge>
                ))}
              </div>
            </div>
          </div>

          {detailData.overview && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t("detail_modal.overview")}</h4>
              <p className="text-sm leading-relaxed text-foreground/80">{detailData.overview}</p>
            </div>
          )}

          {detailData.writer && (
            <div><h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{t("detail_modal.writer")}</h4><p className="text-sm">{detailData.writer}</p></div>
          )}

          {(detailData.country || detailData.box_office) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
  );
}
