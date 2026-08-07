import { useState, useRef, useLayoutEffect, useCallback, useEffect } from "react";

/**
 * A hook that measures the actual DOM widths of pill elements (along with
 * any prefix elements like a label or "All" button rendered in the same
 * measurement div) and calculates how many pills can fit in the available
 * container width — leaving room for a "more" toggle button.
 *
 * The LAST child of the measurement div must be the "more" button, styled
 * exactly like the visible one (with its widest possible content, e.g.
 * "+{total} 更多"). Its real width is measured rather than estimated, so the
 * row never overflows and the button never wraps to a second line.
 *
 * Usage:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const [visibleCount, measureRef] = useAutoFitCount(containerRef, gapPx, prefixCount);
 *
 * // containerRef → wraps the visible row
 * // measureRef  → attach to an off-screen div that renders EVERYTHING
 * //               (label + all-btn + all pills + more-btn, in this order)
 * // prefixCount → how many children of the measurement div are NOT pills
 * //               (label + optional all-btn)
 * ```
 */
export function useAutoFitCount(
  containerRef: React.RefObject<HTMLDivElement | null>,
  gapPx: number,
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
    // Need at least: prefixes + one pill + the trailing more button
    if (children.length <= prefixCount + 1) return;
    itemWidthsRef.current = children.map((c) => c.offsetWidth);
  }, [prefixCount]);

  // Recalculate how many pills fit in the available container width
  const recalculate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const widths = itemWidthsRef.current;
    // The LAST child of the measurement div is the more button — use its
    // real measured width instead of a hard-coded estimate.
    const moreBtnWidth = widths[widths.length - 1] ?? 0;
    const totalPills = widths.length - prefixCount - 1;
    if (totalPills <= 0) return;

    const containerWidth = container.clientWidth;

    // Account for prefix elements (label + all-btn), with gaps between them
    let usedWidth = 0;
    for (let i = 0; i < prefixCount && i < widths.length; i++) {
      usedWidth += widths[i] + (i > 0 ? gapPx : 0);
    }

    // Now count how many pills can fit after the prefix, reserving the
    // trailing gap + the real more-button width
    let count = 0;
    for (let i = prefixCount; i < widths.length - 1; i++) {
      const withGap = count > 0 ? gapPx : 0;
      const itemTotal = usedWidth + withGap + widths[i];
      const remaining = containerWidth - itemTotal - gapPx - moreBtnWidth;

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
  }, [containerRef, gapPx, prefixCount]);

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
