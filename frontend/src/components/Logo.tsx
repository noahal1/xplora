/**
 * Xplora logo — renders the appropriate PNG logo based on current theme.
 * logo_xplora.png: white text for dark mode
 * logo_xplora_dark.png: black text for light mode
 *
 * Handles remote loading gracefully: shows a skeleton placeholder while the
 * image is downloading, then fades in once fully loaded — preventing the
 * half-loaded / progressive-render flash.
 */

import { useState } from "react";
import logoSrc from "../assets/logo_xplora.png";
import logoSrcDark from "../assets/logo_xplora_dark.png";
import { useTheme } from "../context/ThemeContext";

interface LogoProps {
  className?: string;
}

export function Logo({ className = "h-8 w-auto" }: LogoProps) {
  const { theme } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const src = theme === "light" ? logoSrcDark : logoSrc;

  return (
    <div className={`relative inline-flex ${className}`} style={{ aspectRatio: "120 / 32" }}>
      {/* Skeleton placeholder — shown while loading */}
      {!loaded && !error && (
        <div className="absolute inset-0 rounded skeleton" />
      )}

      {/* Image — hidden until fully loaded.
          key={src} ensures the element is remounted on theme switch so
          loaded/error states reset properly. */}
      <img
        key={src}
        src={src}
        alt="Xplora"
        className={`h-full w-full object-contain transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        draggable={false}
      />

      {/* Fallback — visible on error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          Xplora
        </div>
      )}
    </div>
  );
}
