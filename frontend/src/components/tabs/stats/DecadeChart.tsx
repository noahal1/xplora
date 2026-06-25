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

/* ── Decade bar chart ─────────────────────────────────────────── */
export function DecadeChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -16 }}>
        <XAxis dataKey="name" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis hide domain={[0, max * 1.15]} />
        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--bg-card-hover)" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive animationBegin={200} animationDuration={1000}>
          {data.map((_e, i) => (
            <Cell key={i} fill={color} fillOpacity={0.5 + (data[i].value / max) * 0.5} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
