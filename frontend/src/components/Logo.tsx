/**
 * Xplora logo — renders the appropriate PNG logo based on current theme.
 * logo_xplora.png: white text for dark mode
 * logo_xplora_dark.png: black text for light mode
 */

import logoSrc from "../assets/logo_xplora.png";
import logoSrcDark from "../assets/logo_xplora_dark.png";
import { useTheme } from "../context/ThemeContext";

interface LogoProps {
  className?: string;
}

export function Logo({ className = "h-8 w-auto" }: LogoProps) {
  const { theme } = useTheme();

  return (
    <img
      src={theme === "light" ? logoSrcDark : logoSrc}
      alt="Xplora"
      className={className}
    />
  );
}
