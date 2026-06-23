import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  BarChart3, Film, Star,
  Trophy, ChevronRight, RefreshCw,
  Sparkles, Calendar, TrendingUp,
} from "lucide-react";
import {
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LabelList,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import { translateGenreName } from "../utils/genre";
import CountUp from "./CountUp";
import FadeContent from "./FadeContent";
import TiltedCard from "./TiltedCard";
import { fetchStats } from "../api";
import type { StatsData } from "../types";

/* ── localStorage cache helpers ──────────────────────────────── */
const CACHE_KEY = "xplora-stats-cache";
const CACHE_TTL = 5 * 60 * 1000;

interface StatsCache { data: StatsData; timestamp: number; }
function getCachedStats(): { data: StatsData; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: StatsCache = JSON.parse(raw);
    return { data: cache.data, fresh: Date.now() - cache.timestamp < CACHE_TTL };
  } catch { return null; }
}
function setCachedStats(data: StatsData): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
}
function clearCachedStats(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

/* ── Helpers ─────────────────────────────────────────────────── */

/** Format "YYYY-MM" → "Jan" / "1月" style label (keep short for axis) */
function formatMonthLabel(ym: string): string {
  const d = new Date(ym + "-01T00:00:00");
  if (isNaN(d.getTime())) return ym;
  // Use short month name + last 2 digits of year if different from prev
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/* ── Chart tooltip ──────────────────────────────────────────── */
function ChartTip({ active, payload, label }: any) {
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

/* ── Horizontal bar list ─────────────────────────────────────── */
function BarList({ data, color }: { data: { name: string; value: number }[]; color: string }) {
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

/* ── Year distribution bar chart ──────────────────────────────── */
function YearChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
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

/* ── Decade bar chart ─────────────────────────────────────────── */
function DecadeChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
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

/* ── Monthly trend area chart ─────────────────────────────────── */
function MonthlyTrendChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
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

/* ── Genre bar chart (recharts, horizontal) ──────────────────── */
function GenreBarChart({ data, color }: { data: { name: string; value: number }[]; color: string }) {
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

/* ── Donut chart ──────────────────────────────────────────────── */
function DonutSection({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
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
          <span className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: "var(--seed-fg)" }}>
            <CountUp end={total} duration={1.2} />
          </span>                          <span className="text-[10px] font-medium mt-0.5" style={{ color: "var(--fg-muted)" }}>{t("stats.total_label", "总计")}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {data.map((item, i) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
              <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>{item.name}</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--seed-fg)" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Top Rated Preview ────────────────────────────────────────── */
function TopRatedPreview({ movies, onNavigate }: { movies: StatsData["top_rated"]; onNavigate: () => void }) {
  const { t } = useTranslation();
  const topN = movies.slice(0, 5);
  if (topN.length === 0) return null;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-pointer"
      onClick={onNavigate}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--seed-primary) 8%, transparent), transparent 65%)`,
        border: "1px solid color-mix(in srgb, var(--seed-primary) 14%, transparent)",
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl pointer-events-none"
        style={{ background: `radial-gradient(500px circle at 20% 50%, color-mix(in srgb, var(--seed-primary) 8%, transparent), transparent)` }}
      />
      <div className="relative z-10 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--seed-primary) 20%, transparent)" }}>
              <Trophy size={15} style={{ color: "var(--seed-primary)" }} />
            </div>
            <div>
              <span className="text-sm font-semibold" style={{ color: "var(--seed-fg)" }}>
                {t("stats.top_rated", "高分排行榜")}
              </span>
              <span className="text-[10px] ml-2" style={{ color: "var(--fg-muted)" }}>
                <Sparkles size={10} className="inline mr-0.5" style={{ color: "var(--seed-primary)" }} />
                {t("stats.view_top_rated", "浏览 Top 10")}
              </span>
            </div>
          </div>
          <ChevronRight size={15} className="shrink-0 transition-all duration-300 group-hover:translate-x-0.5" style={{ color: "var(--fg-dim)" }} />
        </div>

        {/* Mini grid */}
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {topN.map((movie, i) => (              <div key={movie.id} className="flex flex-col items-center gap-1.5">
              <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-muted/60 border border-border/40">
                {movie.poster_url ? (
                  <TiltedCard
                    imageSrc={movie.poster_url}
                    altText={movie.title}
                    containerHeight="100%"
                    containerWidth="100%"
                    imageHeight="100%"
                    imageWidth="100%"
                    scaleOnHover={1.02}
                    rotateAmplitude={10}
                    displayOverlayContent
                    overlayContent={
                      <div
                        className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-lg"
                        style={{
                          background: i === 0
                            ? "linear-gradient(135deg, #f59e0b, #eab308)"
                            : i === 1
                              ? "linear-gradient(135deg, #94a3b8, #cbd5e1)"
                              : i === 2
                                ? "linear-gradient(135deg, #d97706, #f59e0b)"
                                : "rgba(0,0,0,0.5)",
                          color: i <= 2 ? "#0f0f0f" : "#fff",
                          backdropFilter: "blur(4px)",
                        }}
                      >
                        {i + 1}
                      </div>
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film size={14} style={{ color: "var(--fg-dim)", opacity: 0.4 }} />
                  </div>
                )}
              </div>
              <div className="text-center min-w-0 w-full px-0.5">
                <p className="text-[10px] font-medium truncate leading-tight" style={{ color: "var(--fg-secondary)" }}>
                  {movie.title}
                </p>
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <Star size={8} style={{ color: "var(--seed-primary)" }} />
                  <span className="text-[9px] font-semibold tabular-nums" style={{ color: "var(--fg-muted)" }}>
                    {movie.rating.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Recent row ───────────────────────────────────────────────── */
function RecentRow({ status, title, date }: { status: "watched" | "wish"; title: string; date: string }) {
  const isW = status === "watched";
  return (
    <div className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg transition-all duration-200 cursor-default group">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isW ? "bg-green" : "bg-pink"}`} />
        <span className="text-sm truncate" style={{ color: "var(--seed-fg)" }}>{title}</span>
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
          isW ? "text-green bg-green/10 border border-green/20" : "text-pink bg-pink/10 border border-pink/20"
        }`}>
          {isW ? (
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          )}
          {isW ? "已看" : "想看"}
        </span>
      </div>
      <span className="text-[10px] tabular-nums hidden sm:inline shrink-0" style={{ color: "var(--fg-dim)" }}>{date || ""}</span>
    </div>
  );
}

/* ── Stat Badge ──────────────────────────────────────────────── */
function StatBadge({ color, icon, value, label, pct }: {
  color: string;
  icon: React.ReactNode;
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

/* ── Loading Skeleton ─────────────────────────────────────────── */
function StatsSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero */}
      <div className="rounded-2xl p-6 sm:p-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
        <div className="space-y-4">
          <div className="skeleton w-24 h-4 rounded" />
          <div className="skeleton w-40 h-12 rounded" />
          <div className="flex gap-3 flex-wrap">
            <div className="skeleton h-7 w-24 rounded-full" />
            <div className="skeleton h-7 w-24 rounded-full" />
            <div className="skeleton h-7 w-20 rounded-full" />
          </div>
        </div>
      </div>
      {/* Chart pair */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
            <div className="space-y-4">
              <div className="skeleton w-20 h-3 rounded" />
              <div className="skeleton w-full h-[180px] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      {/* Full width chart */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
        <div className="space-y-4">
          <div className="skeleton w-20 h-3 rounded" />
          <div className="skeleton w-full h-[200px] rounded-lg" />
        </div>
      </div>
      {/* Final pair */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
            <div className="space-y-4">
              <div className="skeleton w-20 h-3 rounded" />
              <div className="skeleton w-full h-[180px] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function StatsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mountedRef = useRef(false);
  const hasDataRef = useRef(false);

  const loadStats = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && !mountedRef.current) {
      const cached = getCachedStats();
      if (cached) {
        setStats(cached.data);
        hasDataRef.current = true;
        if (cached.fresh) { setLoading(false); mountedRef.current = true; return; }
      }
    }
    if (!hasDataRef.current) setLoading(true);
    setError("");
    try {
      const data = await fetchStats();
      setStats(data);
      setCachedStats(data);
    } catch (err: any) {
      setError(err.message || "加载统计数据失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(); mountedRef.current = true; }, [loadStats]);
  const handleRefresh = useCallback(() => { clearCachedStats(); loadStats(true); }, [loadStats]);

  const [genreExpanded, setGenreExpanded] = useState(false);
  const [yearExpanded, setYearExpanded] = useState(false);
  const [yearViewMode, setYearViewMode] = useState<"year" | "decade">("year");

  /* ── Loading ───────────────────────────────────────────── */
  if (loading) {
    return <StatsSkeleton />;
  }

  /* ── Error ─────────────────────────────────────────────── */
  if (error && !stats) {
    return (
      <div className="section-card flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-glow)" }}>
          <BarChart3 size={20} style={{ color: "var(--seed-primary)" }} />
        </div>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>{error || t("stats.no_data", "暂无数据")}</p>
        <button className="btn btn-ghost btn-xs gap-1.5" onClick={() => { clearCachedStats(); loadStats(true); }}>
          <RefreshCw size={13} /> {t("stats.retry", "重试")}
        </button>
      </div>
    );
  }

  /* ── Data ──────────────────────────────────────────────── */
  const ratingData = stats!.rating_distribution.map((r) => ({ name: r.range, value: r.count }));
  const genreMap = new Map<string, number>();
  for (const g of stats!.genre_distribution) {
    const name = translateGenreName(g.genre);
    genreMap.set(name, (genreMap.get(name) || 0) + g.count);
  }
  const genreData = Array.from(genreMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const decadeData = stats!.decade_distribution.map((d) => ({ name: d.decade, value: d.count }));
  const yearData = stats!.year_distribution
    .map((d) => ({ name: String(d.year), value: d.count }))
    .sort((a, b) => parseInt(a.name) - parseInt(b.name));
  const trendData = stats!.monthly_trend.map((d) => ({ name: formatMonthLabel(d.month), value: d.count }));

  const GENRE_LIMIT = 8;
  const YEAR_LIMIT = 20;
  const genreTruncated = genreData.length > GENRE_LIMIT;
  const genreDisplay = genreTruncated && !genreExpanded ? genreData.slice(0, GENRE_LIMIT) : genreData;
  const yearTruncated = yearData.length > YEAR_LIMIT;
  const yearDisplay = yearTruncated && !yearExpanded ? yearData.slice(-YEAR_LIMIT) : yearData;

  const s = stats!;
  const watchedPct = s.total > 0 ? Math.round((s.total_watched / s.total) * 100) : 0;
  const wishPct = s.total > 0 ? Math.round((s.total_wishlist / s.total) * 100) : 0;

  const hasRating = ratingData.some((r) => r.value > 0);
  const hasYearDecade = yearData.length > 0 || decadeData.length > 0;
  const grid1Both = hasRating && hasYearDecade;
  const hasMediaType = s.media_type_distribution.length > 1;
  const hasRecent = s.recent_additions.length > 0;
  const grid2Both = hasMediaType && hasRecent;

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════
          HERO — warm editorial welcome
         ══════════════════════════════════════════════════════ */}
      <FadeContent>
        <div
          className="relative overflow-hidden rounded-2xl p-6 sm:p-8 transition-all duration-500"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, var(--seed-primary) 6%, var(--seed-surface)), var(--seed-bg) 70%)`,
            border: "1px solid color-mix(in srgb, var(--seed-primary) 14%, transparent)",
          }}
        >
          <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full opacity-[0.07] blur-3xl pointer-events-none" style={{ background: "var(--seed-primary)" }} />
          <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full opacity-[0.05] blur-3xl pointer-events-none" style={{ background: "var(--seed-primary)" }} />

          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: "var(--accent-glow)" }}>
                    <BarChart3 size={14} style={{ color: "var(--seed-primary)" }} />
                  </span>
                  <h1 className="text-sm font-semibold tracking-tight" style={{ color: "var(--seed-fg)" }}>
                    {t("stats.title", "数据概览")}
                  </h1>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl sm:text-6xl font-bold tabular-nums tracking-tight leading-none" style={{ color: "var(--seed-primary)" }}>
                    <CountUp end={s.total} duration={1.4} />
                  </span>
                  <span className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
                    {t("stats.total", "部电影")}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 已看 badge */}
                  <StatBadge
                    color="--color-green"
                    icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>}
                    value={s.total_watched}
                    label={t("stats.watched_short", "已看")}
                    pct={s.total > 0 ? watchedPct : undefined}
                  />

                  {/* 想看 badge */}
                  <StatBadge
                    color="--color-pink"
                    icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>}
                    value={s.total_wishlist}
                    label={t("stats.wishlist_short", "想看")}
                    pct={s.total > 0 ? wishPct : undefined}
                  />

                  {/* 均分 badge */}
                  <StatBadge
                    color="--seed-primary"
                    icon={<Star size={11} />}
                    value={s.avg_rating.toFixed(1)}
                    label={t("stats.avg_short", "均分")}
                  />

                  {/* 月记录 badge */}
                  {trendData.length > 0 && (
                    <StatBadge
                      color="--chart-1"
                      icon={<Calendar size={11} />}
                      value={trendData.length}
                      label={t("stats.month_short", "个月")}
                    />
                  )}
                </div>
              </div>
              <button className="btn btn-ghost btn-xs shrink-0 mt-0.5" onClick={handleRefresh} title={t("stats.refresh", "刷新")}>
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
        </div>
      </FadeContent>



      {/* ══════════════════════════════════════════════════════
          TOP RATED PREVIEW — mini grid of top movies
         ══════════════════════════════════════════════════════ */}
      {s.top_rated.length > 0 && (
        <FadeContent delay={120}>
          <TopRatedPreview movies={s.top_rated} onNavigate={() => navigate("/top-rated")} />
        </FadeContent>
      )}

      {/* ════════════════════════════════════════════════════════
          RATING + YEAR/DECADE DISTRIBUTION — side by side
         ════════════════════════════════════════════════════════ */}
      {(hasRating || hasYearDecade) && (
        <div className={`grid grid-cols-1 ${grid1Both ? 'sm:grid-cols-2' : ''} gap-4`}>
          {hasRating && (
            <FadeContent className={grid1Both ? "h-full" : undefined} delay={160}>
              <ChartCard
                title={t("stats.rating_distribution", "评分分布")}
                count={s.avg_rating.toFixed(1)}
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
              >
                <BarList data={ratingData} color="var(--chart-1)" />
              </ChartCard>
            </FadeContent>
          )}
          {hasYearDecade && (
            <FadeContent className={grid1Both ? "h-full" : undefined} delay={200}>
              <ChartCard
                title={yearViewMode === "year" ? t("stats.year_distribution", "年份分布") : t("stats.decade_distribution", "年代分布")}
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
              >
                {/* Toggle */}
                <div className="flex items-center gap-1 mb-3">
                  <button
                    onClick={() => setYearViewMode("year")}
                    className={`pill !text-[11px] ${yearViewMode === "year" ? "active" : ""}`}
                  >
                    {t("stats.by_year", "按年")}
                  </button>
                  <button
                    onClick={() => setYearViewMode("decade")}
                    className={`pill !text-[11px] ${yearViewMode === "decade" ? "active" : ""}`}
                  >
                    {t("stats.by_decade", "按年代")}
                  </button>
                </div>
                {yearViewMode === "year" && yearData.length > 0 ? (
                  <>
                    <YearChart data={yearDisplay} color="var(--chart-3)" />
                    {yearTruncated && (
                      <button
                        onClick={() => setYearExpanded(!yearExpanded)}
                        className="w-full mt-2 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 text-muted-foreground hover:text-foreground"
                      >
                        {yearExpanded
                          ? `${t("stats.show_recent", "显示最近")} ${YEAR_LIMIT} 年`
                          : `${t("stats.expand", "展开全部")} ${yearData.length} 年`
                        }
                      </button>
                    )}
                  </>
                ) : decadeData.length > 0 ? (
                  <DecadeChart data={decadeData} color="var(--chart-4)" />
                ) : null}
              </ChartCard>
            </FadeContent>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MONTHLY TREND — full width area chart
         ══════════════════════════════════════════════════════ */}
      {trendData.length > 1 && (
        <FadeContent delay={240}>
          <ChartCard
            title={t("stats.monthly_trend", "月度趋势")}
            icon={<TrendingUp size={14} />}
          >
            <MonthlyTrendChart data={trendData} color="var(--chart-1)" />
            <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: "var(--fg-dim)" }}>
              <span>{trendData[0]?.name}</span>
              <span className="flex items-center gap-1">
                <TrendingUp size={10} style={{ color: "var(--chart-1)" }} />
                {t("stats.monthly_trend_desc", "每月新增数量趋势")}
              </span>
              <span>{trendData[trendData.length - 1]?.name}</span>
            </div>
          </ChartCard>
        </FadeContent>
      )}

      {/* ══════════════════════════════════════════════════════
          GENRE — full width (was paired with decade, now merged)
         ══════════════════════════════════════════════════════ */}
      {genreData.length > 0 && (
        <FadeContent delay={280}>
          <ChartCard
            title={t("stats.genre_distribution", "类型分布")}
            count={`${genreData.length} ${t("stats.total_genres", "种")}`}
            icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>}
          >
            <GenreBarChart data={genreDisplay} color="#394c79" />
            {genreTruncated && (
              <button
                onClick={() => setGenreExpanded(!genreExpanded)}
                className="w-full mt-4 py-2 text-xs font-medium rounded-lg transition-all duration-200 text-muted-foreground hover:text-foreground"
              >
                {genreExpanded
                  ? `${t("stats.collapse", "收起至")} ${GENRE_LIMIT} ${t("stats.kinds", "种")}`
                  : `${t("stats.expand", "展开全部")} ${genreData.length} ${t("stats.kinds", "种")}`
                }
              </button>
            )}
          </ChartCard>
        </FadeContent>
      )}

      {/* ══════════════════════════════════════════════════════
          MEDIA TYPE + RECENT — side by side
         ══════════════════════════════════════════════════════ */}
      {(hasMediaType || hasRecent) && (
        <div className={`grid grid-cols-1 ${grid2Both ? 'sm:grid-cols-2' : ''} gap-4`}>
          {hasMediaType && (
            <FadeContent className={grid2Both ? "h-full" : undefined} delay={360}>
              <ChartCard
                title={t("stats.media_type_distribution", "媒体类型")}
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
              >
                <DonutSection
                  data={s.media_type_distribution.map((m) => ({
                    name: m.type === "movie" ? t("stats.movie", "电影") : t("stats.tv", "剧集"),
                    value: m.count,
                  }))}
                  colors={["var(--chart-1)", "var(--chart-3)"]}
                />
              </ChartCard>
            </FadeContent>
          )}
          {hasRecent && (
            <FadeContent className={grid2Both ? "h-full" : undefined} delay={400}>
              <ChartCard
                title={t("stats.recent_additions", "最近添加")}
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              >
                <div className="space-y-0.5">
                  {s.recent_additions.slice(0, 7).map((item, i) => (
                    <RecentRow key={i} status={item.status as "watched" | "wish"} title={item.title} date={item.created_at?.slice(0, 10) || ""} />
                  ))}
                </div>
              </ChartCard>
            </FadeContent>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chart card wrapper ──────────────────────────────────────── */
function ChartCard({ title, count, icon, children }: {
  title: string; count?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="group relative rounded-2xl p-5 sm:p-6 transition-all duration-300 h-full" style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-default)",
    }}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {icon && <span className="shrink-0" style={{ color: "var(--seed-primary)" }}>{icon}</span>}
          <span className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--fg-dim)" }}>
            {title}
          </span>
          {count && (
            <span className="text-[10px] font-medium tabular-nums ml-auto" style={{ color: "var(--fg-muted)" }}>
              {count}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
