import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: (e?: React.MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

// ── Static keyframe injected once into the document ────────────────
let keyframesInjected = false;

function ensureKeyframes() {
  if (keyframesInjected) return;
  keyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes themeIrisWipe {
      0%   { clip-path: circle(0%   at var(--origin-x) var(--origin-y)); }
      50%  { clip-path: circle(75%  at var(--origin-x) var(--origin-y)); }
      100% { clip-path: circle(141% at var(--origin-x) var(--origin-y)); }
    }
  `;
  document.head.appendChild(style);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("xplora-theme");
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches)
      return "light";
    return "dark";
  });

  // ── Iris-wipe transition state ───────────────────────────────────
  const [transitioning, setTransitioning] = useState(false);
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.5 });
  const pendingTheme = useRef<Theme | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
    localStorage.setItem("xplora-theme", theme);
  }, [theme]);

  // Inject keyframes once on mount
  useEffect(() => {
    ensureKeyframes();
  }, []);

  const toggleTheme = useCallback(
    (e?: React.MouseEvent) => {
      // Guard against rapid double-clicks while transitioning
      if (transitioning) return;

      // Capture click position relative to viewport
      let x = 0.5;
      let y = 0.5;
      if (e) {
        x = e.clientX / window.innerWidth;
        y = e.clientY / window.innerHeight;
      }
      setOrigin({ x, y });

      const nextTheme = theme === "dark" ? "light" : "dark";
      pendingTheme.current = nextTheme;
      setTransitioning(true);

      // Switch theme at the midpoint of the animation
      setTimeout(() => {
        setTheme(nextTheme);
      }, 300);

      // Store cleanup timer so it can be cancelled on unmount
      const cleanupTimer = setTimeout(() => {
        setTransitioning(false);
        pendingTheme.current = null;
        timerRef.current = null;
      }, 700);
      timerRef.current = cleanupTimer;
    },
    [theme, transitioning],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // The overlay's background is the opposite theme's bg color
  const overlayBg =
    pendingTheme.current === "light" ? "#fafafa" : "#08090a";

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}

      {/* Iris-wipe overlay — uses CSS custom properties from style attr */}
      {transitioning && (
        <div
          className="theme-transition-overlay"
          style={
            {
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              pointerEvents: "none",
              background: overlayBg,
              "--origin-x": `${origin.x * 100}%`,
              "--origin-y": `${origin.y * 100}%`,
              animation: "themeIrisWipe 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            } as React.CSSProperties
          }
        />
      )}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
