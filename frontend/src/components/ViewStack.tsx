import {
  Children,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

/** Expo-out ease — buttery deceleration for view switches. */
const VIEW_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

interface ViewStackProps {
  /** The `data-view` value of the currently active child. */
  active: string;
  children: ReactNode;
  /** Cross-fade duration in ms. @default 200 */
  fadeDuration?: number;
  /** Container height morph duration in ms. @default 320 */
  heightDuration?: number;
  /** Extra classes for the container (e.g. a one-time entrance animation). */
  className?: string;
}

/**
 * ViewStack — keeps every child permanently mounted and cross-fades between
 * them (the outgoing view fades out on top while the incoming one fades in
 * beneath), smoothly morphing the container height so nothing pops or jumps.
 * Ideal for buttery tab switches: no remounts, no refetches, no layout snaps.
 */
export default function ViewStack({
  active,
  children,
  fadeDuration = 200,
  heightDuration = 320,
  className = "",
}: ViewStackProps) {
  const viewRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [height, setHeight] = useState<number | "auto">("auto");

  // Lock the container height to the active view. ResizeObserver keeps it in
  // sync when async content loads or changes while that view is on screen.
  useLayoutEffect(() => {
    const el = viewRefs.current[active];
    if (!el) return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      setHeight(h > 0 ? h : "auto");
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  const containerStyle: CSSProperties = {
    height: height === "auto" ? undefined : height,
    transition: `height ${heightDuration}ms ${VIEW_EASE}`,
  };

  return (
    <div className={`relative overflow-hidden ${className}`} style={containerStyle}>
      {Children.map(children, (child) => {
        const view = (child as ReactElement<{ "data-view"?: string }> | null)?.props?.["data-view"];
        if (!view) return child; // pass through non-view children (e.g. modals)
        const isActive = view === active;
        return (
          <div
            key={view}
            ref={(el) => {
              viewRefs.current[view] = el;
            }}
            aria-hidden={!isActive}
            inert={!isActive}
            className={
              isActive
                ? "relative opacity-100"
                : "absolute inset-x-0 top-0 z-10 opacity-0 pointer-events-none"
            }
            style={{ transition: `opacity ${fadeDuration}ms ${VIEW_EASE}`, willChange: "opacity" }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
