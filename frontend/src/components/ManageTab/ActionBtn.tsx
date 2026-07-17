import type { ReactNode } from "react";

interface ActionBtnProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color: "green" | "sky" | "amber" | "destructive";
  /** When true, the button appears highlighted/active */
  highlight?: boolean;
  /** Sizing variant: "sm" (small) for expanded season rows, "md" (default) for normal rows */
  size?: "sm" | "md";
}

const colorMap: Record<string, { normal: string; hover: string }> = {
  green: { normal: "text-muted-foreground", hover: "hover:text-green hover:bg-green/10" },
  sky: { normal: "text-muted-foreground", hover: "hover:text-sky hover:bg-sky/10" },
  amber: { normal: "text-muted-foreground", hover: "hover:text-amber hover:bg-amber/10" },
  destructive: { normal: "text-muted-foreground", hover: "hover:text-destructive hover:bg-destructive/10" },
};

export function ActionBtn({ icon, label, onClick, disabled, color, highlight, size = "md" }: ActionBtnProps) {
  const c = colorMap[color] || colorMap.sky;
  const activeNormal = highlight ? { green: "text-green", sky: "text-amber", amber: "text-primary", destructive: "" }[color] || "text-muted-foreground" : c.normal;
  const padding = size === "sm" ? "px-1 py-0.5" : "px-1.5 py-1";

  return (
    <button
      className={`${padding} rounded-md transition-all ${activeNormal} ${c.hover} disabled:opacity-30 disabled:pointer-events-none`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {icon}
    </button>
  );
}
