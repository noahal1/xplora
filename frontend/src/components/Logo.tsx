/**
 * Xplora logo — renders the user's PNG logo image.
 */

import logoSrc from "../assets/logo_xplora.png";

interface LogoProps {
  className?: string;
}

export function Logo({ className = "h-28 w-auto" }: LogoProps) {
  return (
    <img
      src={logoSrc}
      alt="Xplora"
      className={className}
    />
  );
}
