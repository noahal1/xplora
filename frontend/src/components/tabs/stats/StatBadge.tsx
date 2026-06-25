import type { ReactNode } from "react";

/* ── Stat Badge ──────────────────────────────────────────────── */
export function StatBadge({ color, icon, value, label, pct }: {
  color: string;
  icon: ReactNode;
  value: string | number;
  label: string;
  pct?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105" style={{
      background: `color-mix(in srgb, var(${color}) 14%, transparent)`,
      color: `var(${color})`,
      border: `1px solid color-mix(in srgb, var(${color}) 20%, transparent)`,
    }}>
      {icon}
      <span className="tabular-nums font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
      {pct !== undefined && <span className="opacity-50 text-[10px]">{pct}%</span>}
    </span>
  );
}
