import { useMemo } from "react";
import type { TFunction } from "i18next";
import type { MediaItem } from "../../../types";

interface TasteReelProps {
  movies: MediaItem[];
  t: TFunction;
}

const FRAME_COUNT = 6;

/** A filmstrip of the user's highest-rated watched films — the AI's evidence. */
export function TasteReel({ movies, t }: TasteReelProps) {
  const frames = useMemo(() => {
    const byRating = [...movies].sort((a, b) => b.rating - a.rating);
    const picked = byRating.slice(0, FRAME_COUNT);
    return Array.from({ length: FRAME_COUNT }, (_, i) => picked[i] ?? null);
  }, [movies]);

  const framesMarkup = frames.map((movie, i) =>
    movie ? (
      <figure className="reel-frame" key={i}>
        {movie.poster_url ? (
          <img src={movie.poster_url} alt="" loading="lazy" />
        ) : (
          <span className="reel-frame-fallback" aria-hidden="true">{movie.title.slice(0, 2)}</span>
        )}
        <figcaption className="reel-frame-number">{movie.rating.toFixed(1)}</figcaption>
      </figure>
    ) : (
      <figure className="reel-frame reel-frame-empty" key={i} aria-hidden="true" />
    )
  );

  return (
    <section className="taste-reel" aria-label={t("recommend.reel_label")}>
      <div className="reel-band">
        <div className="reel-perforations" aria-hidden="true" />
        <div className="reel-track no-scrollbar" aria-hidden="true">
          {framesMarkup}
        </div>
        <div className="reel-perforations" aria-hidden="true" />
        {/* Projector-light sweep; clipped to the band and hidden from assistive tech. */}
        <div className="reel-sweep" aria-hidden="true" />
      </div>
      <div className="reel-copy">
        <p className="reel-copy-title">{t("recommend.reel_title")}</p>
        <p className="reel-copy-desc">
          {t("recommend.reel_desc", { count: movies.length })}
        </p>
      </div>
    </section>
  );
}
