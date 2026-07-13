import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface FilterBarProps {
  children: React.ReactNode;
  collapseLabel: string;
  expandLabel: string;
}

/**
 * FilterBar — responsive filter collapsible for mobile.
 *
 * On desktop (sm+) filters are always visible.
 * On mobile a toggle button collapses/expands the children.
 */
export function FilterBar({ children, collapseLabel, expandLabel }: FilterBarProps) {
  const [expanded, setExpanded] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 640
  );

  // Listen for resize to auto-expand on desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 640) {
        setExpanded(true);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      {/* Toggle button — visible only on mobile */}
      <div className="sm:hidden flex items-center gap-2 mb-2">
        <button
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all w-full justify-between"
          style={{
            background: expanded ? "var(--accent-glow)" : "var(--bg-input)",
            border: `1px solid ${expanded ? "var(--primary-20)" : "var(--border-subtle)"}`,
          }}
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="12" y1="18" x2="20" y2="18" />
            </svg>
            <span>{expanded ? collapseLabel : expandLabel}</span>
          </div>
          <ChevronDown
            size={14}
            className="transition-transform duration-200"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
      </div>

      {/* Collapsible content — smooth height transition instead of instant hide */}
      <div
        className={`sm:block overflow-hidden transition-all duration-300 ${
          expanded
            ? "max-sm:opacity-100 max-sm:max-h-[2000px]"
            : "max-sm:opacity-0 max-sm:max-h-0"
        }`}
        style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
      >
        {children}
      </div>
    </>
  );
}
