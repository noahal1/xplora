import type { ReactNode } from "react";

/* ── Chart card wrapper ──────────────────────────────────────── */
export function ChartCard({ title, count, icon, children }: {
  title: string; count?: string; icon?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="group relative rounded-2xl p-5 sm:p-6 transition-all duration-300 h-full" style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-default)",
    }}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-dim">
            {title}
          </span>
          {count && (
            <span className="text-[10px] font-medium tabular-nums ml-auto text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
