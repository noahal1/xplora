import { useMemo, useState, useEffect } from "react";
import TiltedCard from "./TiltedCard";
import Masonry from "./Masonry";
import type { MasonryItem } from "./Masonry";

type MovieItem = { id: number; title: string; poster_url?: string; rating: number; year?: number | null };

interface DomeGalleryProps {
  movies: MovieItem[];
  onMovieClick: (movie: MovieItem) => void;
}

// ── Rank badge helpers
const rankBadgeBg = (rank: number) => {
  if (rank === 1) return "linear-gradient(135deg, #f59e0b, #eab308)";
  if (rank === 2) return "linear-gradient(135deg, #94a3b8, #cbd5e1)";
  if (rank === 3) return "linear-gradient(135deg, #b45309, #d97706)";
  return "rgba(255,255,255,0.08)";
};

const rankBadgeText = (rank: number) => (rank <= 3 ? "#fff" : "var(--fg-secondary)");

export default function DomeGallery({
  movies,
  onMovieClick,
}: DomeGalleryProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Trigger mount after render so GSAP can animate
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Build masonry items with height multipliers (relative to column width × aspect ratio).
  // Masonry uses aspectRatio to compute actual pixel heights, with `height` as a multiplier
  // where 100 = base (1.0x), 100 = hero (1.0x), 60 = compact (0.6x), etc.
  const masonryItems = useMemo<MasonryItem[]>(() => {
    return movies.map((m, i) => {
      const rank = i + 1;
      const factor = rank === 1 ? 1.0 : rank % 3 === 0 ? 0.8 : rank % 3 === 1 ? 0.7 : 0.6;
      return {
        id: `m-${rank}`,
        height: Math.round(factor * 100),
        data: { ...m, rank },
      };
    });
  }, [movies]);

  // Custom render for each masonry item
  const renderItem = (item: MasonryItem) => {
    const movie = (item.data || {}) as MovieItem & { rank: number };
    const rank = (item.data as any)?.rank ?? 0;
    const isHero = rank === 1;
    const glowColor =
      rank === 1 ? "rgba(245,158,11,0.18)" : rank === 2 ? "rgba(148,163,184,0.14)" : rank === 3 ? "rgba(180,83,9,0.14)" : "";

    return (
      <div className="relative w-full h-full rounded-[14px] overflow-hidden cursor-pointer" style={{ touchAction: "manipulation" }}>
        {/* Glow border for top 3 */}
        {rank <= 3 && (
          <div
            className="absolute inset-0 rounded-[14px] pointer-events-none z-[1]"
            style={{
              background: glowColor,
              boxShadow: `inset 0 0 0 1px ${glowColor.replace("0.18", "0.10").replace("0.14", "0.08")}`,
            }}
          />
        )}

        {/* Rank badge */}
        <div
          className="absolute top-[8px] left-[8px] z-10 pointer-events-none flex items-center justify-center
                     shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{
            width: isHero ? 30 : 26,
            height: isHero ? 30 : 26,
            borderRadius: isHero ? 10 : 9,
            fontSize: isHero ? 13 : 11,
            fontWeight: 800,
            color: rankBadgeText(rank),
            background: rankBadgeBg(rank),
          }}
        >
          {rank}
        </div>

        {/* Poster with 3D tilt (tilt only on desktop) */}
        {movie.poster_url ? (
          <TiltedCard
            imageSrc={movie.poster_url}
            altText={movie.title}
            containerHeight="100%"
            containerWidth="100%"
            imageHeight="100%"
            imageWidth="100%"
            scaleOnHover={isMobile ? 1 : 1.04}
            rotateAmplitude={isMobile ? 0 : 6}
            overlayContent={
              <div
                className={`absolute inset-0 bg-gradient-to-t from-black/88 via-black/30 to-transparent
                  flex flex-col justify-end ${isMobile ? "p-2" : "p-3"}
                  transition-opacity duration-300 opacity-100`}
              >
                <span
                  className="text-white font-semibold leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]
                             line-clamp-2"
                  style={{ fontSize: isHero ? (isMobile ? 13 : 15) : (isMobile ? 10 : 11) }}
                >
                  {movie.title}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className="text-[#fbbf24] font-bold"
                    style={{ fontSize: isHero ? (isMobile ? 11 : 12) : (isMobile ? 9 : 10) }}
                  >
                    ★ {movie.rating.toFixed(1)}
                  </span>
                  {movie.year && (
                    <span className="text-white/50" style={{ fontSize: isHero ? (isMobile ? 10 : 11) : (isMobile ? 8 : 10) }}>
                      {movie.year}
                    </span>
                  )}
                </div>
              </div>
            }
            displayOverlayContent={true}
            onClick={() => onMovieClick(movie)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center
                        bg-gradient-to-br from-white/[0.04] to-white/[0.01]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                 className="opacity-15" width={isHero ? 40 : 28} height={isHero ? 40 : 28}>
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>
    );
  };

  if (masonryItems.length === 0) return null;

  return (
    <div
      style={{
        width: "100%",
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.3s ease",
        touchAction: "manipulation",
      }}
    >
      <Masonry
        items={masonryItems}
        renderItem={renderItem}
        onItemClick={(item) => {
          const movie = (item.data || {}) as MovieItem;
          onMovieClick(movie);
        }}
        aspectRatio={2 / 3}
        animateFrom={isMobile ? "bottom" : "bottom"}
        stagger={0.08}
        ease="power3.out"
        blurToFocus={!isMobile}
        scaleOnHover={false}
        colorShiftOnHover={false}
      />
    </div>
  );
}
