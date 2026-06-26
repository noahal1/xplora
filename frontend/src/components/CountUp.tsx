import { useEffect, useRef, useState, useMemo } from "react";

interface CountUpProps {
  /** Target number to count up to. */
  end: number;
  /** Number to start counting from. @default 0 */
  start?: number;
  /** Animation duration in seconds. @default 1.5 */
  duration?: number;
  /** Delay before starting animation in ms. @default 0 */
  delay?: number;
  /** Number of decimal places. @default 0 */
  decimals?: number;
  /** Prefix before the number (e.g. "+"). */
  prefix?: string;
  /** Suffix after the number (e.g. "%"). */
  suffix?: string;
  /** CSS class name. */
  className?: string;
  /** Whether to only trigger once when in view. @default true */
  triggerOnce?: boolean;
  /** IntersectionObserver threshold. @default 0.1 */
  threshold?: number;
  /** Easing: ease-out exponent. @default 4 */
  easeExponent?: number;
  /** Separator for thousands (e.g. "," or " "). */
  separator?: string;
  /** Callback when animation completes. */
  onComplete?: () => void;
  /** Re-animate on value change. @default false */
  reanimateOnChange?: boolean;
}

/**
 * CountUp — animates a number from `start` to `end` when scrolled into view.
 * Based on the React Bits copy-paste component pattern.
 *
 * Usage:
 *   <CountUp end={100} suffix="%" duration={2} />
 *   <CountUp end={movie.rating} decimals={1} />
 */
export default function CountUp({
  end,
  start = 0,
  duration = 1.5,
  delay = 0,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
  triggerOnce = true,
  threshold = 0.1,
  easeExponent = 4,
  separator,
  onComplete,
  reanimateOnChange = false,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const hasAnimated = useRef(false);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const previousEndRef = useRef(end);

  // Reset animation state when `end` changes (if reanimateOnChange)
  useEffect(() => {
    if (reanimateOnChange && previousEndRef.current !== end) {
      previousEndRef.current = end;
      hasAnimated.current = false;
      setInView(false);
    }
  }, [end, reanimateOnChange]);

  // IntersectionObserver to trigger animation
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Delay before starting animation
          if (delay > 0) {
            setTimeout(() => setInView(true), delay);
          } else {
            setInView(true);
          }
          if (triggerOnce) observer.disconnect();
        } else if (!triggerOnce) {
          setInView(false);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, triggerOnce, threshold]);

  // Animation loop
  useEffect(() => {
    if (!inView || hasAnimated.current) return;
    hasAnimated.current = true;

    const el = ref.current;
    if (!el) return;

    const from = start;
    const to = end;
    const range = to - from;

    if (range === 0) {
      el.textContent = formatNumber(to);
      onComplete?.();
      return;
    }

    startTimeRef.current = 0;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = (timestamp - startTimeRef.current) / 1000;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic (or custom exponent)
      const eased = 1 - Math.pow(1 - progress, easeExponent);
      const current = from + range * eased;

      if (el) el.textContent = formatNumber(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        if (el) el.textContent = formatNumber(to);
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, end, start, duration, decimals, easeExponent]);

  const formatNumber = (value: number) => {
    const fixed = value.toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");
    const formattedInt = separator
      ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
      : intPart;
    const result = decPart !== undefined
      ? `${formattedInt}.${decPart}`
      : formattedInt;
    return `${prefix}${result}${suffix}`;
  };

  // SSR / initial display (before animation)
  const initialDisplay = useMemo(() => formatNumber(start), [start, decimals, separator, prefix, suffix]);

  return (
    <span
      ref={ref}
      className={`tabular-nums ${className}`}
      style={{ willChange: "contents" }}
    >
      {initialDisplay}
    </span>
  );
}
