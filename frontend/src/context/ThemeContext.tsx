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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("xplora-theme");
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches)
      return "light";
    return "dark";
  });

  // Guard + cleanup ref for the theme-transitioning timer
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimer.current !== null) {
        clearTimeout(transitionTimer.current);
      }
    };
  }, []);

  const toggleTheme = useCallback(
    (_e?: React.MouseEvent) => {
      // Guard against rapid clicks while the CSS transition is running
      if (transitionTimer.current !== null) return;

      const nextTheme = theme === "dark" ? "light" : "dark";

      // Add transitioning class so CSS transitions in style.css animate
      // all theme colours smoothly (background, border, text, etc.).
      document.documentElement.classList.add("theme-transitioning");

      // Switch theme immediately — colour interpolation is handled by CSS
      setTheme(nextTheme);

      // Remove the transition class after the animation completes.
      // The 350 ms matches the transition duration in style.css.
      transitionTimer.current = setTimeout(() => {
        document.documentElement.classList.remove("theme-transitioning");
        transitionTimer.current = null;
      }, 350);
    },
    [theme],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
