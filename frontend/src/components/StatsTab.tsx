import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BarChart3, Star, RefreshCw, Calendar, TrendingUp, Clock } from "lucide-react";
import { translateGenreName } from "../utils/genre";
import CountUp from "./CountUp";
import FadeContent from "./FadeContent";
import { getErrMsg } from "../lib/utils";
import { fetchStats } from "../api";
import type { StatsData } from "../types";

import { StatsSkeleton } from "./tabs/stats/StatsSkeleton";
import { StatBadge } from "./tabs/stats/StatBadge";
import { TopRatedPreview } from "./tabs/stats/TopRatedPreview";
import { ChartCard } from "./tabs/stats/ChartCard";
import { BarList } from "./tabs/stats/BarList";
import { YearChart } from "./tabs/stats/YearChart";
import { DecadeChart } from "./tabs/stats/DecadeChart";
import { formatMonthLabel, MonthlyTrendChart } from "./tabs/stats/MonthlyTrendChart";
import { GenreBarChart } from "./tabs/stats/GenreBarChart";
import { WorldMapChart } from "./tabs/stats/WorldMapChart";
import { DonutSection } from "./tabs/stats/DonutSection";
import { RecentRow } from "./tabs/stats/RecentRow";

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

/* ── Format total minutes into human-readable string ───────── */
function formatWatchTime(minutes: number): string {
  if (minutes <= 0) return "0";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

/* ── Generate fun analogies for watch time ───────────────── */
function getWatchTimeAnalogies(minutes: number): Array<{ icon: string; text: string }> {
  if (minutes <= 0) return [];
  const hours = minutes / 60;
  const days = hours / 24;
  const years = days / 365;
  const candidates: Array<{ icon: string; text: string }> = [];

  // 1. Continuous watching
  if (days >= 1) {
    const d = Math.floor(days);
    const h = Math.round((days - d) * 24);
    candidates.push({
      icon: "🎬",
      text: h > 0 ? `连续看片 ${d} 天 ${h} 小时` : `连续看片 ${d} 天`,
    });
  } else if (hours >= 2) {
    candidates.push({ icon: "🎬", text: `连续看片 ${Math.round(hours)} 小时` });
  }

  // 2. 工作日 (8h/day)
  if (days >= 3) {
    candidates.push({ icon: "💼", text: `相当于 ${Math.round(days)} 个工作日` });
  }

  // 3. 🚗 自驾北京→拉萨（约 3,600km，40h）
  const beijingLhasa = hours / 40;
  if (beijingLhasa >= 0.5) {
    const label = beijingLhasa > 100 ? "100+" : beijingLhasa.toFixed(1);
    candidates.push({ icon: "🚗", text: `自驾北京→拉萨 ${label} 次` });
  }

  // 4. 🎮 通关《黑神话：悟空》（平均 ≈ 40h）
  const wukong = hours / 40;
  if (wukong >= 0.3) {
    const label = wukong > 100 ? "100+" : wukong.toFixed(1);
    candidates.push({ icon: "🎮", text: `通关《黑神话：悟空》${label} 遍` });
  }

  // 5. 《老友记》— 236 eps × 22 min ≈ 86.53h
  const friendsRuns = hours / 86.53;
  if (friendsRuns >= 0.5) {
    const label = friendsRuns > 100 ? "100+" : friendsRuns.toFixed(1);
    candidates.push({ icon: "📺", text: `刷完《老友记》${label} 遍` });
  }

  // 6. 《甄嬛传》— 76 eps × 45 min = 57h
  const zhenhuanRuns = hours / 57;
  if (zhenhuanRuns >= 0.5) {
    const label = zhenhuanRuns > 100 ? "100+" : zhenhuanRuns.toFixed(1);
    candidates.push({ icon: "👑", text: `刷完《甄嬛传》${label} 遍` });
  }

  // 7. 📚 听完《三体》有声书（≈ 120h）
  const threeBody = hours / 120;
  if (threeBody >= 0.5) {
    const label = threeBody > 100 ? "100+" : threeBody.toFixed(1);
    candidates.push({ icon: "📚", text: `听完《三体》有声书 ${label} 遍` });
  }

  // 8. 💍 看完《指环王》三部曲（≈ 12h）
  const lotrRuns = hours / 12;
  if (lotrRuns >= 0.5 && lotrRuns <= 50) {
    candidates.push({ icon: "💍", text: `看完《指环王》三部曲 ${lotrRuns.toFixed(1)} 遍` });
  }

  // 9. ✈️ 北京→纽约往返飞行（单程 ≈ 14h）
  const flights = hours / 14;
  if (flights >= 1) {
    candidates.push({ icon: "✈️", text: `北京→纽约往返飞行 ${Math.round(flights)} 次` });
  }

  // 10. 🏔️ 攀登珠穆朗玛峰（≈ 240h）
  const everest = hours / 240;
  if (everest >= 0.5) {
    const label = everest > 100 ? "100+" : everest.toFixed(1);
    candidates.push({ icon: "🏔️", text: `攀登珠穆朗玛峰 ${label} 次` });
  }

  // 11. 🌊 看完《海贼王》动画（≈ 440h）
  const onePiece = hours / 440;
  if (onePiece >= 0.5) {
    const label = onePiece > 100 ? "100+" : onePiece.toFixed(1);
    const epCount = onePiece > 100 ? "" : `（${Math.round(440 * onePiece)} 集）`;
    candidates.push({ icon: "🌊", text: `看完《海贼王》动画 ${label} 遍${epCount}` });
  }

  // 12. 🌍 绕地球赤道步行（≈ 8,015h/圈）
  const earthWalk = hours / 8015;
  if (earthWalk >= 0.5) {
    const label = earthWalk > 100 ? "100+" : earthWalk.toFixed(1);
    candidates.push({ icon: "🌍", text: `绕地球赤道步行 ${label} 圈` });
  }

  // 13. ⏰ 占平均寿命百分比（80年 ≈ 700,800h）
  if (years >= 0.1) {
    const pct = ((years / 80) * 100).toFixed(1);
    candidates.push({ icon: "⏰", text: `相当于人生 ${pct}% 的时光` });
  }

  // Pick one random analogy
  if (candidates.length === 0) return [];
  const idx = Math.floor(Math.random() * candidates.length);
  return [candidates[idx]];
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
    } catch (err: unknown) {
      setError(getErrMsg(err) || "加载统计数据失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(); mountedRef.current = true; }, [loadStats]);
  const handleRefresh = useCallback(() => { clearCachedStats(); loadStats(true); }, [loadStats]);

  const [genreExpanded, setGenreExpanded] = useState(false);
  const [yearExpanded, setYearExpanded] = useState(false);
  const [yearViewMode, setYearViewMode] = useState<"year" | "decade">("year");

  /* ── Watch time analogy (must be before early returns!) ── */
  const watchTimeAnalogies = useMemo(
    () => getWatchTimeAnalogies(stats?.total_watch_time ?? 0),
    [stats?.total_watch_time]
  );

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
                    {t("stats.total", "部")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {/* 已看 badge */}
                  <StatBadge
                    color="--color-green"
                    icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>}
                    value={s.total_watched}
                    label={t("stats.watched_short", "已看")}
                  />

                  {/* 想看 badge */}
                  <StatBadge
                    color="--color-pink"
                    icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>}
                    value={s.total_wishlist}
                    label={t("stats.wishlist_short", "想看")}
                  />

                  {/* 均分 badge */}
                  <StatBadge
                    color="--seed-primary"
                    icon={<Star size={11} />}
                    value={s.avg_rating.toFixed(1)}
                    label={t("stats.avg_short", "均分")}
                  />

                </div>
              </div>
              <button className="btn btn-ghost btn-xs shrink-0 mt-0.5" onClick={handleRefresh} title={t("stats.refresh", "刷新")}>
                <RefreshCw size={12} />
              </button>
            </div>

            {/* ══════════════════════════════════════════════════
                WATCH TIME — compact inline row
               ══════════════════════════════════════════════════ */}
            {s.total_watch_time > 0 && (
              <div className="mt-3 pt-3 flex items-center gap-2 text-sm flex-wrap" style={{ borderTop: "1px solid color-mix(in srgb, var(--seed-primary) 10%, transparent)" }}>
                <span className="shrink-0 inline-flex items-center gap-1.5" style={{ color: "var(--chart-2)" }}>
                  <Clock size={13} />
                  <span className="font-[510]">{formatWatchTime(s.total_watch_time)}</span>
                </span>
                {watchTimeAnalogies.length > 0 && (
                  <>
                    <span className="text-xs" style={{ color: "var(--fg-dim)" }}>·</span>
                    <span className="shrink-0">{watchTimeAnalogies[0].icon}</span>
                    <span style={{ color: "var(--fg-secondary)" }}>{watchTimeAnalogies[0].text}</span>
                  </>
                )}
              </div>
            )}
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
          GENRE — full width
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

      {/* ════════════════════════════════════════════════════════
          WORLD MAP — movie/TV origin countries
         ════════════════════════════════════════════════════════ */}
      {(s.country_distribution?.length ?? 0) > 0 && (
        <FadeContent delay={320}>
          <ChartCard
            title={t("stats.world_map", "产地分布")}
            icon={
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            }
          >
            <WorldMapChart data={s.country_distribution} />
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
