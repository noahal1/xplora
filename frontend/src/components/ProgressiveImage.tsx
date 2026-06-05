import { useState, useEffect, useRef } from "react";

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
}

export function ProgressiveImage({ src, alt, className = "", wrapperClassName = "" }: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(false);
  const mountedRef = useRef(true);
  const srcRef = useRef(src);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // IntersectionObserver: only preload when the element enters the viewport
  // (or comes within 200px of it, giving us a head start on scrolling).
  // This prevents all off-screen posters from being downloaded at once,
  // which was the problem with the previous eager new Image() approach.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Preload the image using JS Image() with callbacks set BEFORE src.
  // This guarantees onload fires even for cached images, avoiding the
  // classic React race condition where onLoad on the DOM <img> element
  // fires before the handler is attached.
  // Only runs when inView is true (gated by IntersectionObserver above).
  useEffect(() => {
    if (!inView) return;

    setLoaded(false);
    setError(false);
    srcRef.current = src;

    const img = new Image();
    let cancelled = false;

    img.onload = () => {
      if (!cancelled && mountedRef.current && srcRef.current === src) {
        setLoaded(true);
      }
    };
    img.onerror = () => {
      if (!cancelled && mountedRef.current) {
        setError(true);
      }
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, inView]);

  return (
    <div ref={containerRef} className={`poster-container w-full h-full aspect-[2/3] relative ${wrapperClassName}`}>
      {/* Blur placeholder while loading */}
      {!loaded && !error && (
        <div className="poster-blur animate-pulse" />
      )}
      {/* Display image — only rendered when in view to avoid the browser
          starting its own fetch before the preload above has completed.
          The `loaded` class triggers the CSS fade-in + imageReveal animation. */}
      {inView && (
        <img
          src={src}
          alt={alt}
          className={`${className} ${loaded ? "loaded" : ""}`}
        />
      )}
      {/* Fallback emoji on error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-lg opacity-40 bg-muted/60">
          🎬
        </div>
      )}
    </div>
  );
}
