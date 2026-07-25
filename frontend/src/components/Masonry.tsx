import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";

/* ── Hooks ────────────────────────────────────────── */

function useMedia(queries: string[], values: number[], defaultValue: number): number {
  const get = () => {
    if (typeof window === "undefined") return defaultValue;
    return values[queries.findIndex((q) => matchMedia(q).matches)] ?? defaultValue;
  };
  const [value, setValue] = useState<number>(get);
  useEffect(() => {
    const handler = () => setValue(get);
    queries.forEach((q) => matchMedia(q).addEventListener("change", handler));
    return () => queries.forEach((q) => matchMedia(q).removeEventListener("change", handler));
  }, [queries]);
  return value;
}

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, size] as const;
}

async function preloadImages(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.src = src;
          img.onload = img.onerror = () => resolve();
        }),
    ),
  );
}

/* ── Types ────────────────────────────────────────── */

export interface MasonryItem {
  id: string;
  /** Image src for the default background rendering (ignored when renderItem is used) */
  img?: string;
  /**
   * Height value.
   * - When `aspectRatio` is NOT set: absolute pixel height (will be halved).
   * - When `aspectRatio` IS set: a height multiplier relative to the base (1.0).
   *   E.g. 1.5 = 1.5x taller (hero), 0.85 = slightly shorter.
   */
  height: number;
  /** Optional custom data passed to renderItem */
  data?: unknown;
}

interface MasonryProps {
  items: MasonryItem[];
  /** Custom renderer for each item – overrides default background-image display */
  renderItem?: (item: MasonryItem, index: number) => React.ReactNode;
  /** Called when an item is clicked (replaces the default window.open) */
  onItemClick?: (item: MasonryItem) => void;
  /**
   * Target width/height aspect ratio for items (e.g. 2/3 for poster portraits).
   * When set, item heights are computed from the column width × this ratio,
   * with `height` field used as a multiplier (1.0 = base).
   * When unset, `height` is treated as absolute pixels (divided by 2).
   */
  aspectRatio?: number;
  ease?: string;
  duration?: number;
  stagger?: number;
  animateFrom?: "bottom" | "top" | "left" | "right" | "center" | "random";
  scaleOnHover?: boolean;
  hoverScale?: number;
  blurToFocus?: boolean;
  colorShiftOnHover?: boolean;
}

/* ── Grid item (internal) ─────────────────────────── */

interface GridItem extends MasonryItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ── Component ────────────────────────────────────── */

export default function Masonry({
  items,
  renderItem,
  onItemClick,
  aspectRatio,
  ease = "power3.out",
  duration = 0.6,
  stagger = 0.05,
  animateFrom = "bottom",
  scaleOnHover = true,
  hoverScale = 0.95,
  blurToFocus = true,
  colorShiftOnHover = false,
}: MasonryProps) {
  const columns = useMedia(
    ["(min-width:1500px)", "(min-width:1000px)", "(min-width:600px)", "(min-width:400px)"],
    [5, 4, 3, 2],
    1,
  );

  const [containerRef, { width }] = useMeasure<HTMLDivElement>();
  const [imagesReady, setImagesReady] = useState(false);

  const getInitialPosition = (item: GridItem) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return { x: item.x, y: item.y };

    let direction = animateFrom;
    if (animateFrom === "random") {
      const dirs: (typeof animateFrom)[] = ["top", "bottom", "left", "right"];
      direction = dirs[Math.floor(Math.random() * dirs.length)];
    }

    switch (direction) {
      case "top":
        return { x: item.x, y: -200 };
      case "bottom":
        return { x: item.x, y: window.innerHeight + 200 };
      case "left":
        return { x: -200, y: item.y };
      case "right":
        return { x: window.innerWidth + 200, y: item.y };
      case "center":
        return {
          x: containerRect.width / 2 - item.w / 2,
          y: containerRect.height / 2 - item.h / 2,
        };
      default:
        return { x: item.x, y: item.y + 100 };
    }
  };

  // Preload images (only needed when using default background rendering)
  useEffect(() => {
    const imgs = items.filter((i) => i.img).map((i) => i.img!);
    if (imgs.length > 0) {
      preloadImages(imgs).then(() => setImagesReady(true));
    } else {
      setImagesReady(true);
    }
  }, [items]);

  // Calculate grid positions
  const grid = useMemo<GridItem[]>(() => {
    if (!width) return [];
    const colHeights = new Array(columns).fill(0);
    const gap = 16;
    const totalGaps = (columns - 1) * gap;
    const columnWidth = (width - totalGaps) / columns;

    return items.map((child) => {
      const col = colHeights.indexOf(Math.min(...colHeights));
      const x = col * (columnWidth + gap);

      // Calculate height: when aspectRatio is set, compute from column width
      // using `height` as a variation multiplier (1.0 = base).
      // Otherwise fall back to original halved-pixel behavior.
      let h: number;
      if (aspectRatio) {
        const baseHeight = columnWidth / aspectRatio;
        h = baseHeight * (child.height / 100);
      } else {
        h = child.height / 2;
      }

      const y = colHeights[col];
      colHeights[col] += h + gap;
      return { ...child, x, y, w: columnWidth, h };
    });
  }, [columns, items, width, aspectRatio]);

  const hasMounted = useRef(false);

  // GSAP entrance animation
  useLayoutEffect(() => {
    if (!imagesReady) return;

    grid.forEach((item) => {
      const selector = `[data-masonry-id="${item.id}"]`;
      const animProps = { x: item.x, y: item.y, width: item.w, height: item.h };

      if (!hasMounted.current) {
        const start = getInitialPosition(item);
        // Extract rank from id (format: "m-{rank}") to compute staggered delay
        const rank = parseFloat(item.id.split("-").pop() || "1");
        const delay = (rank - 1) * stagger;
        gsap.fromTo(
          selector,
          {
            opacity: 0,
            x: start.x,
            y: start.y,
            width: item.w,
            height: item.h,
            ...(blurToFocus && { filter: "blur(10px)" }),
          },
          {
            opacity: 1,
            ...animProps,
            ...(blurToFocus && { filter: "blur(0px)" }),
            duration: 0.8,
            ease: "power3.out",
            delay,
          },
        );
      } else {
        gsap.to(selector, {
          ...animProps,
          duration,
          ease,
          overwrite: "auto",
        });
      }
    });

    hasMounted.current = true;
  }, [grid, imagesReady, stagger, animateFrom, blurToFocus, duration, ease]);

  /* ── Hover handlers ─────────────────────────────── */
  const handleMouseEnter = (id: string, element: HTMLElement) => {
    if (scaleOnHover) {
      gsap.to(`[data-masonry-id="${id}"]`, {
        scale: hoverScale,
        duration: 0.3,
        ease: "power2.out",
      });
    }
    if (colorShiftOnHover) {
      const overlay = element.querySelector(".m-color-overlay") as HTMLElement;
      if (overlay) gsap.to(overlay, { opacity: 0.3, duration: 0.3 });
    }
  };

  const handleMouseLeave = (id: string, element: HTMLElement) => {
    if (scaleOnHover) {
      gsap.to(`[data-masonry-id="${id}"]`, {
        scale: 1,
        duration: 0.3,
        ease: "power2.out",
      });
    }
    if (colorShiftOnHover) {
      const overlay = element.querySelector(".m-color-overlay") as HTMLElement;
      if (overlay) gsap.to(overlay, { opacity: 0, duration: 0.3 });
    }
  };

  /* ── Default render ─────────────────────────────── */
  const defaultContent = (item: MasonryItem) =>
    item.img ? (
      <div
        className="relative w-full h-full bg-cover bg-center rounded-[10px]"
        style={{ backgroundImage: `url(${item.img})` }}
      >
        {colorShiftOnHover && (
          <div className="m-color-overlay absolute inset-0 rounded-[10px] bg-gradient-to-tr from-pink-500/50 to-sky-500/50 opacity-0 pointer-events-none" />
        )}
      </div>
    ) : (
      <div className="relative w-full h-full rounded-[10px] bg-[rgba(255,255,255,0.04)]" />
    );

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-y-auto">
      {grid.map((item, idx) => (
        <div
          key={item.id}
          data-masonry-id={item.id}
          className="absolute box-content"
          style={{ willChange: "transform, width, height, opacity" }}
          onClick={() => onItemClick?.(item)}
          onMouseEnter={(e) => handleMouseEnter(item.id, e.currentTarget)}
          onMouseLeave={(e) => handleMouseLeave(item.id, e.currentTarget)}
        >
          {renderItem ? renderItem(item, idx) : defaultContent(item)}
        </div>
      ))}
    </div>
  );
}
