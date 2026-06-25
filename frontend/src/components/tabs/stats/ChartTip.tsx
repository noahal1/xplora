/* ── Chart tooltip ──────────────────────────────────────────── */
export function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="text-xs rounded-lg shadow-xl backdrop-blur-sm px-3 py-2"
      style={{
        background: "color-mix(in srgb, var(--bg-elevated) 96%, transparent)",
        border: "1px solid var(--border-default)",
        color: "var(--seed-fg)",
      }}
    >
      <p className="font-medium mb-0.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name && <span className="mr-1 opacity-70">{entry.name}</span>}
          <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}
