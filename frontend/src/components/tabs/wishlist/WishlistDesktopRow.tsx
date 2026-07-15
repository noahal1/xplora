import { useTranslation } from "react-i18next";
import type { WishlistEntry } from "../../WishlistTab";
import { Badge } from "../../ui/badge";
import { ProgressiveImage } from "../../ProgressiveImage";
import { Film, ChevronRight } from "lucide-react";
import { translateGenres } from "../../../utils/genre";
import { formatSeasonLabel } from "../../../utils/groupTVSeries";

interface WishlistDesktopRowProps {
  item: WishlistEntry;
  onMarkWatched: (item: WishlistEntry) => void;
  onDelete: (id: number) => void;
  onOpenDetail: (item: WishlistEntry) => void;
  onSearchPT?: (item: WishlistEntry) => void;
  /** undefined = no server, true = on server, false = not on server */
  onServer?: boolean;
}

export function WishlistDesktopRow({ item, onMarkWatched, onDelete, onOpenDetail, onSearchPT, onServer }: WishlistDesktopRowProps) {
  const { t } = useTranslation();

  return (
    <div className="card card-lift p-3.5 flex items-center justify-between cursor-pointer group" onClick={() => onMarkWatched(item)}>
      <div className="flex items-center gap-3"
        onClick={(e) => { e.stopPropagation(); onOpenDetail(item); }}
        style={{ cursor: item.poster_url ? 'pointer' : undefined }}>
        <div className="w-9 h-[54px] shrink-0 rounded overflow-hidden bg-muted/60 flex items-center justify-center text-lg border border-border">
          {item.poster_url ? (
            <ProgressiveImage src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <Film size={14} className="text-fg-dim" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-[510] text-foreground">{item.title}</p>
            {onServer === true && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 leading-none">
                📺 {t("wishlist.on_server")}
              </span>
            )}
            {onServer === false && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 leading-none">
                📡 {t("wishlist.not_on_server")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {item.year && <span className="text-xs text-muted-foreground">{item.year}</span>}
            {item.genre && <span className="badge text-xs">{translateGenres(item.genre)}</span>}
            {item.media_type === "tv" && <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5">TV</Badge>}
            {item.season_number != null && (
              <Badge variant="outline" className="text-[10px] text-violet border-violet/30 bg-violet/5 leading-none px-1.5 py-0.5">
                {formatSeasonLabel(item.season_number, t("season_specials"))}
                {item.episode_count != null && <span className="ml-0.5 opacity-70">· {item.episode_count}ep</span>}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button className="text-xs text-green hover:text-green/80 px-1.5 py-1 rounded transition-all opacity-0 group-hover:opacity-100 max-sm:opacity-100"
          onClick={(e) => { e.stopPropagation(); onMarkWatched(item); }} title={t("wishlist.mark_as_watched")}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </button>
        {onSearchPT && (
          <button className="text-xs text-orange-500 hover:text-orange-600 px-1.5 py-1 rounded transition-all opacity-0 group-hover:opacity-100 max-sm:opacity-100"
            onClick={(e) => { e.stopPropagation(); onSearchPT(item); }} title={t("moviepilot.search_pt")}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" /></svg>
          </button>
        )}
        <button className="text-muted-foreground hover:text-destructive px-1 py-1 rounded transition-all opacity-0 group-hover:opacity-100 max-sm:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} title={t("watched.remove")}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
        </button>
        <ChevronRight size={14} className="text-fg-dim" />
      </div>
    </div>
  );
}
