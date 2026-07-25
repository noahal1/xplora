import { useEffect, useMemo, useRef, useCallback } from "react";
import { useGesture } from "@use-gesture/react";
import type { MediaDetail } from "../types";

interface DomeGalleryProps {
  movies: MediaDetail[];
  onMovieClick: (movie: MediaDetail) => void;
  /** Height of the gallery container */
  height?: string;
  /** Fit factor (0-1), controls how much of the container the sphere fills */
  fit?: number;
  /** Minimum sphere radius in px */
  minRadius?: number;
  /** Maximum vertical rotation in degrees */
  maxVerticalRotationDeg?: number;
  /** Drag sensitivity (lower = more sensitive) */
  dragSensitivity?: number;
  /** Number of segments for the grid */
  segments?: number;
  /** Drag inertia dampening (0-1) */
  dragDampening?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const normalizeAngle = (d: number) => ((d % 360) + 360) % 360;
const wrapAngleSigned = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};

type ItemDef = {
  src: string;
  alt: string;
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  movieIdx: number;
};

function buildItems(
  movies: MediaDetail[],
  seg: number,
): ItemDef[] {
  const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2);
  const evenYs = [-4, -2, 0, 2, 4];
  const oddYs = [-3, -1, 1, 3, 5];
  const coords = xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs;
    return ys.map(y => ({ x, y, sizeX: 2, sizeY: 2 }));
  });

  const totalSlots = coords.length;
  if (movies.length === 0) {
    return coords.map(c => ({ ...c, src: "", alt: "", movieIdx: -1 }));
  }

  // Map movies to slots, repeating if fewer movies than slots
  return coords.map((c, i) => {
    const idx = i % movies.length;
    const movie = movies[idx];
    return {
      ...c,
      src: movie.poster_url || "",
      alt: movie.title,
      movieIdx: idx,
    };
  });
}

export default function DomeGallery({
  movies,
  onMovieClick,
  height = "560px",
  fit = 0.5,
  minRadius = 360,
  maxVerticalRotationDeg = 5,
  dragSensitivity = 20,
  segments = 35,
  dragDampening = 2,
}: DomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef({ x: 0, y: 0 });
  const startRotRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const inertiaRAF = useRef<number | null>(null);
  const tapTargetRef = useRef<HTMLElement | null>(null);
  const tapMovieIdxRef = useRef(-1);

  const items = useMemo(() => buildItems(movies, segments), [movies, segments]);

  const applyTransform = (xDeg: number, yDeg: number) => {
    const el = sphereRef.current;
    if (el) {
      el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`;
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      const w = Math.max(1, cr.width), h = Math.max(1, cr.height);
      const minDim = Math.min(w, h);
      let radius = minDim * fist;
      radius = clamp(radius, minRadius, Infinity);
      root.style.setProperty("--radius", `${Math.round(radius)}px`);
      root.style.setProperty("--segments-x", String(segments));
      root.style.setProperty("--segments-y", String(segments));
      applyTransform(rotationRef.current.x, rotationRef.current.y);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [fit, minRadius, segments]);

  useEffect(() => {
    applyTransform(rotationRef.current.x, rotationRef.current.y);
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRAF.current) {
      cancelAnimationFrame(inertiaRAF.current);
      inertiaRAF.current = null;
    }
  }, []);

  const startInertia = useCallback(
    (vx: number, vy: number) => {
      let vX = clamp(vx, -1.4, 1.4) * 80;
      let vY = clamp(vy, -1.4, 1.4) * 80;
      let frames = 0;
      const d = clamp(dragDampening, 0, 1);
      const frictionMul = 0.94 + 0.055 * d;
      const stopThreshold = 0.015 - 0.01 * d;
      const maxFrames = Math.round(90 + 270 * d);
      const step = () => {
        vX *= frictionMul;
        vY *= frictionMul;
        if (Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) {
          inertiaRAF.current = null;
          return;
        }
        if (++frames > maxFrames) {
          inertiaRAF.current = null;
          return;
        }
        const nextX = clamp(
          rotationRef.current.x - vY / 200,
          -maxVerticalRotationDeg,
          maxVerticalRotationDeg,
        );
        const nextY = wrapAngleSigned(rotationRef.current.y + vX / 200);
        rotationRef.current = { x: nextX, y: nextY };
        applyTransform(nextX, nextY);
        inertiaRAF.current = requestAnimationFrame(step);
      };
      stopInertia();
      inertiaRAF.current = requestAnimationFrame(step);
    },
    [dragDampening, maxVerticalRotationDeg, stopInertia],
  );

  useGesture(
    {
      onDragStart: ({ event }) => {
        stopInertia();
        const evt = event as PointerEvent;
        if ((evt.pointerType as string) === "touch") evt.preventDefault();
        draggingRef.current = true;
        movedRef.current = false;
        startRotRef.current = { ...rotationRef.current };
        startPosRef.current = { x: evt.clientX, y: evt.clientY };
        // Track which movie was tapped
        const el = (evt.target as Element).closest?.("[data-movie-idx]") as HTMLElement | null;
        tapTargetRef.current = el;
        tapMovieIdxRef.current = el ? parseInt(el.dataset.movieIdx || "-1", 10) : -1;
      },
      onDrag: ({ event, last, velocity: velArr = [0, 0], direction: dirArr = [0, 0], movement }) => {
        if (!draggingRef.current || !startPosRef.current) return;
        const evt = event as PointerEvent;
        if ((evt.pointerType as string) === "touch") evt.preventDefault();

        const dxTotal = evt.clientX - startPosRef.current.x;
        const dyTotal = evt.clientY - startPosRef.current.y;
        if (!movedRef.current) {
          const dist2 = dxTotal * dxTotal + dyTotal * dyTotal;
          if (dist2 > 16) movedRef.current = true;
        }

        const nextX = clamp(
          startRotRef.current.x - dyTotal / dragSensitivity,
          -maxVerticalRotationDeg,
          maxVerticalRotationDeg,
        );
        const nextY = startRotRef.current.y + dxTotal / dragSensitivity;
        const cur = rotationRef.current;
        if (cur.x !== nextX || cur.y !== nextY) {
          rotationRef.current = { x: nextX, y: nextY };
          applyTransform(nextX, nextY);
        }

        if (last) {
          draggingRef.current = false;
          let isTap = false;
          if (startPosRef.current) {
            const dx = evt.clientX - startPosRef.current.x;
            const dy = evt.clientY - startPosRef.current.y;
            const dist2 = dx * dx + dy * dy;
            const TAP_THRESH_PX = (evt.pointerType as string) === "touch" ? 10 : 6;
            if (dist2 <= TAP_THRESH_PX * TAP_THRESH_PX) isTap = true;
          }

          let [vMagX, vMagY] = velArr;
          const [dirX, dirY] = dirArr;
          let vx = vMagX * dirX;
          let vy = vMagY * dirY;

          if (!isTap && Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001 && Array.isArray(movement)) {
            const [mx, my] = movement;
            vx = (mx / dragSensitivity) * 0.02;
            vy = (my / dragSensitivity) * 0.02;
          }

          if (!isTap && (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005)) {
            startInertia(vx, vy);
          }

          startPosRef.current = null;

          // Handle tap → open movie detail
          if (isTap && tapMovieIdxRef.current >= 0 && tapMovieIdxRef.current < movies.length) {
            onMovieClick(movies[tapMovieIdxRef.current]);
          }
          tapTargetRef.current = null;
          tapMovieIdxRef.current = -1;
          movedRef.current = false;
        }
      },
    },
    { target: mainRef, eventOptions: { passive: false } },
  );

  const cssStyles = `
    .dg-root {
      --radius: 520px;
      --circ: calc(var(--radius) * 3.1416);
      --rot-y: calc(360deg / var(--segments-x) / 2);
      --rot-x: calc(360deg / var(--segments-y) / 2);
      --item-width: calc(var(--circ) / var(--segments-x));
      --item-height: calc(var(--circ) / var(--segments-y));
    }
    .dg-root * { box-sizing: border-box; }
    .dg-sphere, .dg-item, .dg-item__image { transform-style: preserve-3d; }
    .dg-stage {
      perspective: calc(var(--radius) * 2.2);
      perspective-origin: 50% 50%;
    }
    .dg-sphere {
      transform: translateZ(calc(var(--radius) * -1));
      will-change: transform;
    }
    .dg-item {
      width: calc(var(--item-width) * var(--item-size-x));
      height: calc(var(--item-height) * var(--item-size-y));
      position: absolute;
      top: -999px; bottom: -999px; left: -999px; right: -999px;
      margin: auto;
      transform-origin: 50% 50%;
      backface-visibility: hidden;
      transform: rotateY(calc(var(--rot-y) * (var(--offset-x) + ((var(--item-size-x) - 1) / 2)) + var(--rot-y-delta, 0deg)))
                 rotateX(calc(var(--rot-x) * (var(--offset-y) - ((var(--item-size-y) - 1) / 2)) + var(--rot-x-delta, 0deg)))
                 translateZ(var(--radius));
    }
    .dg-item__image {
      position: absolute;
      inset: 8px;
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      transition: transform 200ms ease, box-shadow 200ms ease;
      pointer-events: auto;
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
    }
    .dg-item__image:hover {
      transform: translateZ(0) scale(1.08);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .dg-item__overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 10px;
      opacity: 0;
      transition: opacity 250ms ease;
      border-radius: inherit;
    }
    .dg-item__image:hover .dg-item__overlay,
    .dg-item__overlay--visible {
      opacity: 1;
    }
    .dg-rank {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 24px;
      height: 24px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      color: #fff;
      z-index: 2;
      pointer-events: none;
    }
    .dg-rank.top1 { background: linear-gradient(135deg, #f59e0b, #eab308); }
    .dg-rank.top2 { background: linear-gradient(135deg, #94a3b8, #cbd5e1); }
    .dg-rank.top3 { background: linear-gradient(135deg, #b45309, #d97706); }
    .dg-rank.default { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.6); }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssStyles }} />
      <div
        ref={rootRef}
        className="dg-root relative w-full select-none"
        style={{ height, touchAction: "none" }}
      >
        <main
          ref={mainRef}
          className="absolute inset-0 grid place-items-center overflow-hidden bg-transparent"
          style={{ touchAction: "none", WebkitUserSelect: "none" }}
        >

          {/* Stage container */}
          <div className="dg-stage absolute inset-0 grid place-items-center">
            <div ref={sphereRef} className="dg-sphere">
              {items.map((it, i) => {
                const movie = movies[it.movieIdx];
                const rank = movie ? it.movieIdx + 1 : 0;
                const rankClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "default";

                return (
                  <div
                    key={`${it.x},${it.y},${i}`}
                    className="dg-item"
                    data-movie-idx={it.movieIdx}
                    data-offset-x={it.x}
                    data-offset-y={it.y}
                    data-size-x={it.sizeX}
                    data-size-y={it.sizeY}
                    style={{
                      "--offset-x": it.x,
                      "--offset-y": it.y,
                      "--item-size-x": it.sizeX,
                      "--item-size-y": it.sizeY,
                      top: "-999px",
                      bottom: "-999px",
                      left: "-999px",
                      right: "-999px",
                    } as React.CSSProperties}
                  >
                    <div className="dg-item__image relative">
                      {/* Rank badge */}
                      <div className={`dg-rank ${rankClass}`}>
                        {rank}
                      </div>

                      {/* Poster image */}
                      {it.src ? (
                        <img
                          src={it.src}
                          alt={it.alt}
                          draggable={false}
                          className="w-full h-full object-cover pointer-events-none"
                          style={{ backfaceVisibility: "hidden" }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted/30" />
                      )}

                      {/* Hover overlay with movie info */}
                      <div className="dg-item__overlay">
                        {movie && (
                          <>
                            <p className="text-white text-[10px] font-semibold leading-tight line-clamp-2 drop-shadow-sm">
                              {movie.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] text-amber font-bold tabular-nums">
                                ★ {movie.rating.toFixed(1)}
                              </span>
                              {movie.year && (
                                <span className="text-[9px] text-white/60 tabular-nums">
                                  {movie.year}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
