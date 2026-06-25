import { ChartTip } from "./ChartTip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";

/* ── Genre bar chart (recharts, horizontal) ──────────────────── */
export function GenreBarChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 42, 80)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: -6 }}>
        <XAxis type="number" hide domain={[0, max * 1.18]} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "var(--fg-secondary)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--bg-card-hover)" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18} isAnimationActive animationBegin={200} animationDuration={1000}>
          {data.map((_e, i) => (
            <Cell key={i} fill={color} fillOpacity={0.5 + (data[i].value / max) * 0.5} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            style={{ fill: "var(--fg-muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
