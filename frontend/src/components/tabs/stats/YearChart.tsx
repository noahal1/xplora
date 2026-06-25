import { ChartTip } from "./ChartTip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

/* ── Year distribution bar chart ──────────────────────────────── */
export function YearChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const visible = data.slice(0, 40); // limit to last 40 years
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={visible} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: "var(--fg-muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis hide domain={[0, max * 1.15]} />
        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--bg-card-hover)" }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={12} isAnimationActive animationBegin={200} animationDuration={1000}>
          {visible.map((_e, i) => (
            <Cell key={i} fill={color} fillOpacity={0.4 + (visible[i].value / max) * 0.6} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
