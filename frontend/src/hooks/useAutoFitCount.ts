import { useState, useRef, useLayoutEffect, useCallback, useEffect } from "react";

/**
 * A hook that measures the actual DOM widths of pill elements (along with
 * any prefix elements like a label or "All" button rendered in the same
 * measurement div) and calculates how many pills can fit in the available
 * container width — leaving room for a "more" toggle button.
 *
 * Usage:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const [visibleCount, measureRef] = useAutoFitCount(containerRef, gapPx, moreBtnWidth, prefixCount);
 *
 * // containerRef → wraps the visible row
 * // measureRef  → attach to an off-screen div that renders EVERYTHING (label + all-btn + all pills)
 * // prefixCount → how many children of the measurement div are NOT pills (label + optional all-btn)
 * ```
 */
export function useAutoFitCount(
  containerRef: React.RefObject<HTMLDivElement | null>,
  gapPx: number,
  moreBtnWidthPx: number,
  prefixCount: number,
): [number, React.RefObject<HTMLDivElement | null>] {
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const itemWidthsRef = useRef<number[]>([]);

  // Measure widths of ALL children from the hidden measurement DOM
  const refreshWidths = useCallback(() => {
    const el = measureRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length <= prefixCount) return; // nothing to measure beyond prefixes
    itemWidthsRef.current = children.map((c) => c.offsetWidth);
  }, [prefixCount]);

  // Recalculate how many pills fit in the available container width
  const recalculate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const widths = itemWidthsRef.current;
    const totalPills = widths.length - prefixCount;
    if (totalPills <= 0) return;

    const containerWidth = container.clientWidth;

    // Account for prefix elements (label + all-btn)
    let usedWidth = 0;
    for (let i = 0; i < prefixCount && i < widths.length; i++) {
      usedWidth += widths[i] + (i > 0 ? gapPx : 0);
    }

    // Now count how many pills can fit after the prefix + "more" button
    let count = 0;
    for (let i = prefixCount; i < widths.length; i++) {
      const withGap = count > 0 ? gapPx : 0;
      const itemTotal = usedWidth + withGap + widths[i];
      const needsMore = i < widths.length - 1;
      const remaining = containerWidth - itemTotal - (needsMore ? moreBtnWidthPx : 0);

      if (remaining >= 0) {
        usedWidth = itemTotal;
        count++;
      } else {
        break;
      }
    }

    // If all fit, no more button needed
    if (count >= totalPills) {
      setVisibleCount(totalPills);
    } else {
      setVisibleCount(Math.max(1, count));
    }
  }, [containerRef, gapPx, moreBtnWidthPx, prefixCount]);

  // Measure after every render (useLayoutEffect to avoid flicker)
  useLayoutEffect(() => {
    refreshWidths();
    recalculate();
  });

  // Observe container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      refreshWidths();
      recalculate();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, refreshWidths, recalculate]);

  return [visibleCount, measureRef];
}
