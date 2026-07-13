import { useTranslation } from "react-i18next";
import CountUp from "@/components/CountUp";
import { ChartTip } from "./ChartTip";
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

/* ── Donut chart ──────────────────────────────────────────────── */
export function DonutSection({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  const { t } = useTranslation();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <ResponsiveContainer width={180} height={180}>
          <RePieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none" isAnimationActive animationBegin={200} animationDuration={1200}>
              {data.map((_e, i) => (<Cell key={i} fill={colors[i % colors.length]} />))}
            </Pie>
            <Tooltip content={<ChartTip />} />
          </RePieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
            <CountUp end={total} duration={1.2} />
          </span>
          <span className="text-[10px] font-medium mt-0.5 text-muted-foreground">{t("stats.total_label", "总计")}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {data.map((item, i) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
              <span className="text-xs text-fg-secondary">{item.name}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
