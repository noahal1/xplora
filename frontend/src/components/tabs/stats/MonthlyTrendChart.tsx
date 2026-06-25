import { ChartTip } from "./ChartTip";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/** Format "YYYY-MM" → "Jan" / "1月" style label (keep short for axis) */
function formatMonthLabel(ym: string): string {
  const d = new Date(ym + "-01T00:00:00");
  if (isNaN(d.getTime())) return ym;
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/* ── Monthly trend area chart ─────────────────────────────────── */
export function MonthlyTrendChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const gradientId = "trendGradient";
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="name"
          tick={{ fill: "var(--fg-muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis hide domain={[0, Math.max(max * 1.25, 4)]} />
        <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--border-hover)", strokeDasharray: "3 3" }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive
          animationBegin={200}
          animationDuration={1200}
          dot={false}
          activeDot={{ r: 5, fill: color, stroke: "var(--seed-bg)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export { formatMonthLabel };
