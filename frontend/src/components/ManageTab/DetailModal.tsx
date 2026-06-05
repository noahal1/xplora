import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import { Badge } from "../ui/badge";
import { Modal } from "../Modal";
import { ProgressiveImage } from "../ProgressiveImage";
import { Film, Sparkles } from "lucide-react";

interface DetailModalProps {
  open: boolean;
  movie: MediaDetail | null;
  onClose: () => void;
}

export function DetailModal({ open, movie, onClose }: DetailModalProps) {
  const { t } = useTranslation();
  if (!movie) return null;

  return (
    <Modal open={open} onClose={onClose}
      title={movie.title}
      description={movie.year ? `${movie.year}${movie.genre ? ` · ${movie.genre}` : ""}${movie.runtime ? ` · ${movie.runtime} min` : ""}` : ""}
    >
      <div className="space-y-5">
        <div className="flex gap-4">
          <div className="w-[100px] h-[140px] shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center"
            style={{ border: "1px solid var(--border-subtle)" }}>
            {movie.poster_url ? (
              <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
            ) : <Film size={28} className="text-muted-foreground/30" />}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {movie.overview ? (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.overview")}</p>
                <p className="text-sm leading-relaxed line-clamp-4">{movie.overview}</p>
              </div>
            ) : <p className="text-sm text-muted-foreground italic">{t("detail_modal.no_overview")}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {movie.director && (
            <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.director")}</p><p className="text-sm">{movie.director}</p></>
          )}
          {movie.actors && (
            <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.actors")}</p><p className="text-sm line-clamp-2">{movie.actors}</p></>
          )}
          {movie.country && (
            <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.country")}</p><p className="text-sm">{movie.country}</p></>
          )}
          {movie.awards && (
            <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.awards")}</p><p className="text-sm line-clamp-2">{movie.awards}</p></>
          )}
          {movie.runtime && (
            <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.runtime")}</p><p className="text-sm">{movie.runtime} {t("detail_modal.minutes")}</p></>
          )}
          {movie.tagline && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.tagline")}</p>
              <p className="text-sm italic">"{movie.tagline}"</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {movie.imdb_id && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 8.5h2v7h-2zm5.5 0h2v7h-2zm5.5-3.5h2v10.5h-2zM4 5.5h2v11H4z"/></svg>
              {movie.imdb_id}
            </Badge>
          )}
          {movie.tmdb_id && <Badge variant="outline" className="text-[10px]">TMDB: {movie.tmdb_id}</Badge>}
          {movie.poster_url ? (
            <Badge variant="outline" className="text-[10px] text-green gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>
              {t("manage.metadata_complete")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-amber gap-1">
              <Sparkles size={10} />{t("manage.enrich_hint")}
            </Badge>
          )}
        </div>
      </div>
    </Modal>
  );
}
