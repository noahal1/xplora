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
  const mountedRef = useRef(true);
  // Track the most recent src to avoid stale callbacks
  const srcRef = useRef(src);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Reset state on src change
    setLoaded(false);
    setError(false);
    srcRef.current = src;

    // Use JS Image() to preload with callbacks set BEFORE src.
    // This guarantees onload fires even for cached images, avoiding
    // the classic React race condition where onLoad on the DOM img
    // element fires before the handler is attached.
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
  }, [src]);

  return (
    <div className={`poster-container w-full h-full aspect-[2/3] relative ${wrapperClassName}`}>
      {/* Blur placeholder while loading */}
      {!loaded && !error && (
        <div className="poster-blur animate-pulse" />
      )}
      {/* Display image — uses browser cache from the preload above */}
      <img
        src={src}
        alt={alt}
        className={`${className} ${loaded ? "loaded" : ""}`}
        loading="lazy"
      />
      {/* Fallback emoji on error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-lg opacity-40 bg-muted/60">
          🎬
        </div>
      )}
    </div>
  );
}
