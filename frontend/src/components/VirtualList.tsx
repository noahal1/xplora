import { useLayoutEffect, useRef, useState, type ReactNode, type UIEvent } from "react";

interface VirtualListProps<T> {
  /** All items (only the visible slice is actually rendered). */
  items: T[];
  /** Fixed height of each row in px — rows must be uniform. */
  rowHeight: number;
  /** Max height of the scroll viewport (CSS value). */
  maxHeight?: string;
  /** Extra rows rendered above/below the viewport to hide scroll jank. */
  overscan?: number;
  /** Render one row; receives the item and its absolute index. */
  renderRow: (item: T, index: number) => ReactNode;
  /** Stable key for each item. */
  keyFn?: (item: T, index: number) => string;
  /** Extra class for the scroll container. */
  className?: string;
}

/**
 * Minimal headless virtual list for uniform-height rows.
 *
 * Only the rows inside the visible viewport (plus an overscan buffer)
 * are mounted, so lists with hundreds/thousands of entries stay smooth.
 * The scroll container keeps its own scrollbar; a tall spacer div
 * preserves the full scroll height while rows are absolutely positioned.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  maxHeight = "40vh",
  overscan = 6,
  renderRow,
  keyFn,
  className = "",
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Measure the viewport height synchronously on mount/resize so the
  // first paint already computes the correct visible slice.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = items.length;
  const totalHeight = total * rowHeight;
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleEnd = Math.min(total, Math.ceil((scrollTop + viewportH) / rowHeight) + overscan);
  const visible = items.slice(visibleStart, visibleEnd);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto ${className}`}
      style={{ maxHeight }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.map((item, i) => {
          const index = visibleStart + i;
          return (
            <div
              key={keyFn ? keyFn(item, index) : index}
              style={{ position: "absolute", top: index * rowHeight, left: 0, right: 0, height: rowHeight }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
