import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, ChevronRight, Check, Info, Trash2 } from "lucide-react";
import { Badge } from "../../ui/badge";
import { translateGenres } from "../../../utils/genre";
import { formatSeasonLabel } from "../../../utils/groupTVSeries";
import type { WishlistEntry } from "../../WishlistTab/index";

/* ── Memo-ized mobile card — compact card layout for small screens ── */
export const WishlistMobileCard = memo(function WishlistMobileCard({ item, onMarkWatched, onDelete, onOpenDetail, onSearchPT, onServer, serverPlayUrl }: {
  item: WishlistEntry;
  onMarkWatched: (item: WishlistEntry) => void;
  onDelete: (id: number) => void;
  onOpenDetail: (item: WishlistEntry) => void;
  onSearchPT?: (item: WishlistEntry) => void;
  /** undefined = no server, true = on server, false = not on server */
  onServer?: boolean;
  /** Direct playback URL on the media server (Jellyfin web player) */
  serverPlayUrl?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="p-3 rounded-xl transition-all duration-200 bg-bg-card border border-border"
    >
      {/* Row 1: Poster + Title/Meta */}
      <div className="flex items-start gap-2.5">
        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer border border-border-subtle"
          onClick={() => onOpenDetail(item)}
        >
          {item.poster_url ? (
            <ProgressiveImage src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <Film size={16} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate" onClick={() => onOpenDetail(item)}>{item.title}</span>
                {onServer === true && (
                  serverPlayUrl ? (
                    <a
                      href={serverPlayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 leading-none shrink-0 hover:bg-green-500/20 transition-colors"
                      title={t("wishlist.play_on_server")}
                    >
                      📺 {t("wishlist.on_server")}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 leading-none shrink-0">
                      📺 {t("wishlist.on_server")}
                    </span>
                  )
                )}
                {onServer === false && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 leading-none shrink-0">
                    📡 {t("wishlist.not_on_server")}
                  </span>
                )}
                {item.media_type === "tv" && (
                  <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/80">
                {item.year && <span>{item.year}</span>}
                {item.genre && <span className="truncate">{translateGenres(item.genre)}</span>}
                {item.season_number != null && (
                  <Badge variant="outline" className="text-[9px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0">
                    {formatSeasonLabel(item.season_number, t("season_specials"))}{item.episode_count != null && <span className="ml-0.5 opacity-70">· {item.episode_count}ep</span>}
                  </Badge>
                )}
              </div>
            </div>
            <ChevronRight size={14} className="shrink-0 mt-0.5 text-fg-dim" />
          </div>
        </div>
      </div>

      {/* Row 2: Action buttons */}
      <div className="flex items-center gap-1 mt-2.5 pt-2.5 overflow-x-auto no-scrollbar" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-green hover:bg-green/10 shrink-0"
          onClick={() => onMarkWatched(item)}
        >
          <Check size={14} />
          <span>{t("wishlist.mark_as_watched")}</span>
        </button>
        {onSearchPT && (
          <button
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-orange-500 hover:bg-orange-500/10"
            onClick={() => onSearchPT(item)}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" /></svg>
            <span>{t("moviepilot.search_pt")}</span>
          </button>
        )}
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-sky hover:bg-sky/10"
          onClick={() => onOpenDetail(item)}
        >
          <Info size={14} />
          <span>{t("manage.detail")}</span>
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 size={14} />
          <span>{t("watched.remove")}</span>
        </button>
      </div>
    </div>
  );
}, (prev, next) => {
  const id = prev.item.id;
  if (prev.item.title !== next.item.title) return false;
  if (prev.item.year !== next.item.year) return false;
  if (prev.item.genre !== next.item.genre) return false;
  if (prev.item.poster_url !== next.item.poster_url) return false;
  if (prev.item.media_type !== next.item.media_type) return false;
  if (prev.item.season_number !== next.item.season_number) return false;
  if (prev.item.episode_count !== next.item.episode_count) return false;
  if (prev.onServer !== next.onServer) return false;
  if (prev.serverPlayUrl !== next.serverPlayUrl) return false;
  return true;
});
