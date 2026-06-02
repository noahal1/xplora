import { useState, useCallback, useRef, useEffect } from "react";

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
}

export function ProgressiveImage({ src, alt, className = "", wrapperClassName = "" }: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleLoad = useCallback(() => {
    if (mountedRef.current) setLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    if (mountedRef.current) setError(true);
  }, []);

  return (
    <div className={`poster-container w-full h-full aspect-[2/3] ${wrapperClassName}`}>
      {/* Blur placeholder */}
      {!loaded && !error && (
        <div className="poster-blur animate-pulse" />
      )}
      {/* Actual image */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${className} ${loaded ? "loaded" : ""}`}
        onLoad={handleLoad}
        onError={handleError}
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
