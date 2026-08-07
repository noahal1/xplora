import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import type { MediaSearchResult, ExternalDetail, MediaDetail } from "../types";
import * as api from "../api";
import FadeContent from "./FadeContent";
import { ProgressiveImage } from "./ProgressiveImage";
import { TMDBDetailModal } from "./shared/TMDBDetailModal";
import MorphSlider from "./MorphSlider";
import { getErrMsg } from "../lib/utils";
import { translateGenres } from "../utils/genre";
import { Compass, Film, Flame, Clock, CalendarDays, TrendingUp, Award, Plus, Check, Loader2, Heart } from "lucide-react";

// ── Section config ────────────────────────────────────────────────
// Each section maps to a TMDB feed. media_type only applies to
// trending/popular/top_rated; now_playing/upcoming are movie-only.

const SECTIONS = [
  { id: "trending", icon: Flame, labelKey: "discover.section_trending" },
  { id: "now_playing", icon: Film, labelKey: "discover.section_now_playing" },
  { id: "upcoming", icon: CalendarDays, labelKey: "discover.section_upcoming" },
  { id: "popular", icon: TrendingUp, labelKey: "discover.section_popular" },
  { id: "top_rated", icon: Award, labelKey: "discover.section_top_rated" },
] as const;

const TV_SUPPORTED = new Set(["trending", "popular", "top_rated"]);
const PAGE_SIZE = 20;

export function DiscoverTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [section, setSection] = useState<string>("trending");
  const [mediaType, setMediaType] = useState<string>("all");
  const [timeWindow, setTimeWindow] = useState<string>("week");

  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Wishlist state
  const [wishlistTmdbIds, setWishlistTmdbIds] = useState<Set<string>>(new Set());
  const [wishlistItems, setWishlistItems] = useState<MediaDetail[]>([]);
  const [adding, setAdding] = useState<Record<number, boolean>>({});

  // Top carousel (morph slider) state
  const [sliderIndex, setSliderIndex] = useState(0);
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  // Detail modal
  const [detailResult, setDetailResult] = useState<MediaSearchResult | null>(null);
  const [detailData, setDetailData] = useState<ExternalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the user's current wishlist (TMDB IDs for the "already added" state
  // plus full items so the top carousel can show their posters)
  const loadWishlist = useCallback(async () => {
    try {
      const data = await api.listMedia({ page: 0, page_size: 5000, status: "wish" });
      setWishlistItems(data.media);
      setWishlistTmdbIds(
        new Set(data.media.map((m) => m.tmdb_id).filter((x): x is string => !!x))
      );
    } catch {
      // Best-effort — wishlist badge is non-critical
    }
  }, []);

  const fetchSection = useCallback(async (s: string, mt: string, tw: string, p: number, append = false) => {
    setLoadingMore(append);
    if (!append) {
      setLoading(true);
      setError("");
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await api.getDiscover({
        section: s,
        media_type: mt,
        window: tw,
        page: p,
        signal: controller.signal,
      });
      setResults((prev) => (append ? [...prev, ...data.results] : data.results));
      setHasMore(data.results.length >= PAGE_SIZE);
      setPage(p);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(getErrMsg(err));
        if (!append) setResults([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Reload when section / media type / window changes
  useEffect(() => {
    loadWishlist();
  }, [loadWishlist]);

  useEffect(() => {
    fetchSection(section, mediaType, timeWindow, 1);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [section, mediaType, timeWindow, fetchSection]);

  const changeSection = (s: string) => {
    setSection(s);
    // Reset media type to all when entering a TV-capable section, else movie
    setMediaType(TV_SUPPORTED.has(s) ? "all" : "movie");
  };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchSection(section, mediaType, timeWindow, page + 1, true);
  };

  // ── Add to wishlist ───────────────────────────────────────────
  const addToWishlist = useCallback(async (result: MediaSearchResult, idx: number) => {
    if (adding[idx] || wishlistTmdbIds.has(result.source_id)) return;
    setAdding((prev) => ({ ...prev, [idx]: true }));
    try {
      await api.addToWishlist({
        title: result.title,
        year: result.year,
        genre: result.genre || null,
        tmdb_id: result.source_id,
      });
      setWishlistTmdbIds((prev) => new Set(prev).add(result.source_id));
      // Refresh so the top carousel immediately includes the new poster
      loadWishlist();
      showToast(t("wishlist.added_to_wishlist", { title: result.title }), "success");
    } catch (err) {
      showToast(t("wishlist.add_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAdding((prev) => ({ ...prev, [idx]: false }));
    }
  }, [adding, wishlistTmdbIds, showToast, t, loadWishlist]);

  // ── Detail modal ──────────────────────────────────────────────
  const openDetail = useCallback(async (result: MediaSearchResult) => {
    setDetailResult(result);
    setDetailData(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const data = await api.getExternalDetail(
        result.source,
        result.source_id,
        result.media_type,
      );
      setDetailData(data);
    } catch (err) {
      setDetailError(getErrMsg(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailResult(null);
    setDetailData(null);
    setDetailError("");
  }, []);

  const isInWishlist = (r: MediaSearchResult) =>
    wishlistTmdbIds.has(r.source_id);

  // ── Top wishlist carousel ──────────────────────────────────
  // Slides use the wishlist items that have both a poster and a TMDB id
  // (so clicking a slide can open the TMDB detail modal).
  const sliderItems = useMemo(
    () =>
      wishlistItems
        .filter((m) => !!m.poster_url && !!m.tmdb_id)
        .map((m) => ({ image: m.poster_url as string, caption: m.title, media: m })),
    [wishlistItems]
  );

  const openWishlistDetail = useCallback(
    (item: MediaDetail) => {
      if (!item.tmdb_id) return;
      openDetail({
        title: item.title,
        year: item.year,
        genre: item.genre || "",
        poster_url: item.poster_url,
        source: "tmdb",
        source_id: item.tmdb_id,
        media_type: item.media_type || "movie",
      });
    },
    [openDetail]
  );

  return (
    <div className="space-y-5">
      {/* ── Wishlist morph carousel (top) ──────────────────── */}
      {sliderItems.length > 0 && (
        <FadeContent>
          {/* Cinematic hero banner: blurred backdrop + full uncropped poster */}
          <div
            className="relative w-full h-56 sm:h-72 lg:h-[30rem]"
            role="button"
            tabIndex={0}
            aria-label={t("wishlist.title")}
            onPointerDown={(e) => {
              pressRef.current = { x: e.clientX, y: e.clientY };
            }}
            onClick={(e) => {
              // Ignore clicks on the arrow / indicator buttons
              if ((e.target as HTMLElement).closest("button")) return;
              // Ignore drags (slide-swiping) so they don't open the modal
              const start = pressRef.current;
              if (
                start &&
                (Math.abs(e.clientX - start.x) > 8 ||
                  Math.abs(e.clientY - start.y) > 8)
              ) {
                return;
              }
              const item = sliderItems[sliderIndex]?.media;
              if (item) openWishlistDetail(item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const item = sliderItems[sliderIndex]?.media;
                if (item) openWishlistDetail(item);
              }
            }}
          >
            <MorphSlider
              items={sliderItems}
              transition="melt"
              intensity={0.55}
              autoplay
              autoplayDelay={5}
              radius={16}
              onIndexChange={setSliderIndex}
            />
            {/* Floating badge */}
            <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-white bg-black/45 backdrop-blur-md border border-white/15 shadow-lg">
              <Heart size={12} className="text-rose-400" />
              {t("wishlist.title")}
              <span className="text-white/60 tabular-nums">· {wishlistItems.length}</span>
            </div>
          </div>
        </FadeContent>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <FadeContent className="section-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Compass size={18} className="text-primary" />
              {t("discover.title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("discover.subtitle")}
            </p>
          </div>
          {/* Refresh */}
          <button
            onClick={() => fetchSection(section, mediaType, timeWindow, 1)}
            disabled={loading}
            className="btn btn-ghost btn-sm gap-1.5"
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Clock size={13} />
            )}
            {t("common.refresh")}
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => changeSection(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-accent/50 text-muted-foreground border border-border hover:border-primary/20"
                }`}
              >
                <Icon size={13} />
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Sub-controls: media type + trending window */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {TV_SUPPORTED.has(section) && (
            <div className="flex items-center gap-1 rounded-lg p-0.5 bg-muted/40 border border-border">
              {[
                { value: "all", label: t("discover.type_all") },
                { value: "movie", label: t("discover.type_movie") },
                { value: "tv", label: t("discover.type_tv") },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMediaType(opt.value)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    mediaType === opt.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {section === "trending" && (
            <div className="flex items-center gap-1 rounded-lg p-0.5 bg-muted/40 border border-border">
              {[
                { value: "day", label: t("discover.window_day") },
                { value: "week", label: t("discover.window_week") },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTimeWindow(opt.value)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    timeWindow === opt.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <span className="text-[11px] text-muted-foreground/60 ml-auto tabular-nums">
            {t("discover.result_count", { count: results.length })}
          </span>
        </div>
      </FadeContent>

      {/* ── Error state ─────────────────────────────────────── */}
      {error && (
        <FadeContent className="section-card">
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Film size={28} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => fetchSection(section, mediaType, timeWindow, 1)}
              className="btn btn-primary btn-sm mt-4 gap-1.5"
            >
              <Loader2 size={13} className={loading ? "animate-spin" : ""} />
              {t("common.retry")}
            </button>
          </div>
        </FadeContent>
      )}

      {/* ── Poster grid ─────────────────────────────────────── */}
      {!error && (loading ? (
        <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5 sm:gap-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl skeleton" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <FadeContent className="section-card">
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Film size={30} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t("discover.empty")}</p>
          </div>
        </FadeContent>
      ) : (
        <FadeContent>
          <div ref={scrollRef} className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5 sm:gap-3">
            {results.map((r, idx) => {
              const added = isInWishlist(r);
              return (
                <div
                  key={`${r.source_id}-${idx}`}
                  className="group relative aspect-[2/3] rounded-xl overflow-hidden border border-border-subtle bg-muted cursor-pointer card-lift transition-all"
                  onClick={() => openDetail(r)}
                >
                  {r.poster_url ? (
                    <ProgressiveImage
                      src={r.poster_url}
                      alt={r.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film size={20} className="text-muted-foreground/40" />
                    </div>
                  )}

                  {/* TV badge */}
                  {r.media_type === "tv" && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white backdrop-blur-sm">
                      TV
                    </span>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2">
                    <p className="text-[11px] font-medium text-white leading-snug line-clamp-2 drop-shadow">
                      {r.title}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {r.year && (
                        <span className="text-[9px] text-white/70 tabular-nums">{r.year}</span>
                      )}
                      {r.vote_average != null && (
                        <span className="text-[9px] text-amber-300 font-medium ml-auto">
                          ★ {Number(r.vote_average).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToWishlist(r, idx);
                      }}
                      disabled={adding[idx] || added}
                      className={`mt-1.5 w-full h-6 rounded-md text-[10px] font-medium flex items-center justify-center gap-1 transition-all ${
                        added
                          ? "bg-white/15 text-white/80"
                          : "bg-amber-400 text-black hover:bg-amber-300"
                      }`}
                    >
                      {adding[idx] ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : added ? (
                        <><Check size={10} /> {t("discover.added")}</>
                      ) : (
                        <><Plus size={10} /> {t("discover.add")}</>
                      )}
                    </button>
                  </div>

                  {/* Always-visible genre chip on mobile (no hover) */}
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 sm:hidden">
                    {r.genre && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-black/50 text-white/80 backdrop-blur-sm truncate block">
                        {translateGenres(r.genre)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-5">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-ghost btn-sm gap-1.5"
              >
                {loadingMore ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CalendarDays size={13} />
                )}
                {loadingMore ? t("common.loading") : t("discover.load_more")}
              </button>
            </div>
          )}
        </FadeContent>
      ))}

      {/* ── Detail modal ────────────────────────────────────── */}
      <TMDBDetailModal
        open={detailResult !== null}
        title={detailResult?.title}
        loading={detailLoading}
        error={detailError}
        data={detailData}
        mediaType={detailResult?.media_type}
        tagline={detailData?.tagline}
        onClose={closeDetail}
        t={t}
      />
    </div>
  );
}
