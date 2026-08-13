import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import "./GooeyNav.css";

export interface GooeyNavItem {
  label: string;
  href: string;
  icon?: ReactNode;
}

interface GooeyNavProps {
  items: GooeyNavItem[];
  /** Controlled active index — drive it from the router so programmatic navigation stays in sync */
  activeIndex: number;
  onSelect?: (index: number) => void;
  animationTime?: number;
  particleCount?: number;
  particleDistances?: [number, number];
  particleR?: number;
  timeVariance?: number;
  colors?: number[];
}

/**
 * GooeyNav — adapted from the React Bits component for Xplora:
 * - Fully theme-aware (dark/light via CSS custom properties)
 * - Router-driven `activeIndex` (no internal state, no anchor default navigation)
 * - Supports lucide icons alongside labels
 */
const GooeyNav = ({
  items,
  activeIndex,
  onSelect,
  animationTime = 500,
  particleCount = 10,
  particleDistances = [56, 12],
  particleR = 50,
  timeVariance = 220,
  colors = [1, 2, 1, 1, 2, 1, 1, 1],
}: GooeyNavProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLSpanElement>(null);

  const noise = (n = 1) => n / 2 - Math.random() * n;

  const getXY = (distance: number, pointIndex: number, totalPoints: number) => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };

  const createParticle = (i: number, t: number, d: [number, number], r: number) => {
    const rotate = noise(r / 10);
    return {
      start: getXY(d[0], particleCount - i, particleCount),
      end: getXY(d[1] + noise(7), particleCount - i, particleCount),
      time: t,
      scale: 1 + noise(0.2),
      color: colors[Math.floor(Math.random() * colors.length)],
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
    };
  };

  const makeParticles = (element: HTMLSpanElement) => {
    const d = particleDistances;
    const r = particleR;
    const bubbleTime = animationTime * 2 + timeVariance;
    element.style.setProperty("--time", `${bubbleTime}ms`);

    for (let i = 0; i < particleCount; i++) {
      const t = animationTime * 2 + noise(timeVariance * 2);
      const p = createParticle(i, t, d, r);
      element.classList.remove("active");

      setTimeout(() => {
        const particle = document.createElement("span");
        const point = document.createElement("span");
        particle.classList.add("particle");
        particle.style.setProperty("--start-x", `${p.start[0]}px`);
        particle.style.setProperty("--start-y", `${p.start[1]}px`);
        particle.style.setProperty("--end-x", `${p.end[0]}px`);
        particle.style.setProperty("--end-y", `${p.end[1]}px`);
        particle.style.setProperty("--time", `${p.time}ms`);
        particle.style.setProperty("--scale", `${p.scale}`);
        particle.style.setProperty("--color", `var(--color-${p.color}, var(--seed-primary))`);
        particle.style.setProperty("--rotate", `${p.rotate}deg`);

        point.classList.add("point");
        particle.appendChild(point);
        element.appendChild(particle);
        requestAnimationFrame(() => {
          element.classList.add("active");
        });
        setTimeout(() => {
          try {
            element.removeChild(particle);
          } catch {
            // Do nothing
          }
        }, t);
      }, 30);
    }
  };

  /** Reposition the particle layer onto the given <li> (the active label lives on the <li> itself) */
  const updateEffectPosition = (element: HTMLElement) => {
    if (!containerRef.current || !filterRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pos = element.getBoundingClientRect();

    const styles = {
      left: `${pos.left - containerRect.left}px`,
      top: `${pos.top - containerRect.top}px`,
      width: `${pos.width}px`,
      height: `${pos.height}px`,
    };
    Object.assign(filterRef.current.style, styles);
  };

  const trigger = (index: number, element: HTMLElement) => {
    if (activeIndex === index) return;

    onSelect?.(index);
    updateEffectPosition(element);

    if (filterRef.current) {
      const particles = filterRef.current.querySelectorAll(".particle");
      particles.forEach((p) => filterRef.current?.removeChild(p));
    }

    if (filterRef.current) {
      makeParticles(filterRef.current);
    }
  };

  const handleClick = (e: MouseEvent<HTMLAnchorElement>, index: number) => {
    // Allow native behavior for modified clicks (Cmd/Ctrl/Shift/Alt or middle-click → new tab/window)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const liEl = e.currentTarget.closest("li") as HTMLElement | null;
    if (liEl) trigger(index, liEl);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const liEl = e.currentTarget.closest("li") as HTMLElement | null;
      if (liEl) trigger(index, liEl);
    }
  };

  useEffect(() => {
    if (!navRef.current || !containerRef.current || activeIndex < 0) return;
    const activeLi = navRef.current.querySelectorAll("li")[activeIndex] as HTMLElement | undefined;
    if (activeLi) updateEffectPosition(activeLi);

    const resizeObserver = new ResizeObserver(() => {
      if (activeIndex < 0) return;
      const currentActiveLi = navRef.current?.querySelectorAll("li")[activeIndex] as HTMLElement | undefined;
      if (currentActiveLi) updateEffectPosition(currentActiveLi);
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  return (
    <div className="gooey-nav-container" ref={containerRef}>
      {/* Shared gooey filter: alpha-only thresholding preserves particle colors.
          (CSS `contrast(100)` would crush amber into red/yellow depending on theme) */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <defs>
          <filter id="gooeynav-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <nav>
        <ul ref={navRef}>
          {items.map((item, index) => (
            <li key={index} className={activeIndex === index ? "active" : ""}>
              <a
                href={item.href}
                aria-current={activeIndex === index ? "page" : undefined}
                onClick={(e) => handleClick(e, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <span className="effect filter" ref={filterRef} aria-hidden="true" />
    </div>
  );
};

export default GooeyNav;
