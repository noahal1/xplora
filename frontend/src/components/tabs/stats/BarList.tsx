/* ── Horizontal bar list ─────────────────────────────────────── */
export function BarList({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium truncate" style={{ color: "var(--fg-secondary)" }}>
              {item.name}
            </span>
            <span className="text-sm font-semibold tabular-nums ml-3" style={{ color: "var(--fg-muted)" }}>
              {item.value}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-input)" }}>
            <div
              className="h-full rounded-full transition-all duration-[1200ms] ease-out"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                transitionDelay: `${i * 60}ms`,
                background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 30%, transparent))`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
