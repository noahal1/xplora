// ── 临时参数实验室:比较 GooeyNav 粒子参数(验证完删除)──
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Film, BookmarkPlus, Compass, Sparkles, BarChart3, Library, Sun, Moon } from "lucide-react";
import GooeyNav, { type GooeyNavItem } from "./src/components/GooeyNav";
import Aurora from "./src/components/Aurora";
import "./src/style.css";

const tabs = [
  { id: "watched", label: "已看", icon: Film },
  { id: "wishlist", label: "想看", icon: BookmarkPlus },
  { id: "discover", label: "发现", icon: Compass },
  { id: "recommend", label: "推荐", icon: Sparkles },
  { id: "stats", label: "统计", icon: BarChart3 },
  { id: "manage", label: "管理", icon: Library },
];

interface Params {
  particleCount: number;
  distances: [number, number];
  particleR: number;
  timeVariance: number;
  animationTime: number;
}

const PRESETS: Record<string, Params> = {
  收敛: { particleCount: 6, distances: [28, 8], particleR: 32, timeVariance: 140, animationTime: 420 },
  当前: { particleCount: 10, distances: [56, 12], particleR: 50, timeVariance: 220, animationTime: 500 },
  明显: { particleCount: 16, distances: [90, 16], particleR: 68, timeVariance: 280, animationTime: 520 },
  夸张: { particleCount: 24, distances: [130, 22], particleR: 90, timeVariance: 360, animationTime: 600 },
};

const DEFAULT_PARAMS: Params = { ...PRESETS["明显"] };

function paramsToProps(p: Params) {
  return `particleCount={${p.particleCount}}
particleDistances={[${p.distances[0]}, ${p.distances[1]}]}
particleR={${p.particleR}}
timeVariance={${p.timeVariance}}
animationTime={${p.animationTime}}`;
}

function NavRow({
  name,
  params,
  active,
  onSelect,
}: {
  name: string;
  params: Params;
  active: number;
  onSelect: (i: number) => void;
}) {
  const items = useMemo<GooeyNavItem[]>(
    () =>
      tabs.map((tab, i) => {
        const Icon = tab.icon;
        return {
          label: tab.label,
          href: `/${tab.id}`,
          icon: <Icon size={14} key={String(i === active)} className={i === active ? "animate-tab-icon-bounce" : ""} />,
        };
      }),
    [active]
  );
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
          {name}
        </h3>
        <code className="text-[10px] text-muted-foreground font-mono whitespace-pre text-right leading-relaxed">
          {paramsToProps(params)}
        </code>
      </div>
      {/* 与真实 TabNav 相同的包裹结构 */}
      <div className="max-sm:hidden mb-5 pb-3 border-b border-border-subtle">
        <GooeyNav
          items={items}
          activeIndex={active}
          onSelect={onSelect}
          particleCount={params.particleCount}
          particleDistances={params.distances}
          particleR={params.particleR}
          timeVariance={params.timeVariance}
          animationTime={params.animationTime}
        />
      </div>
      {/* 模拟下方内容区,观察粒子与内容的叠压关系 */}
      <div className="section-card h-16 flex items-center justify-center">
        <span className="text-[11px] text-muted-foreground/50">内容区占位 —— 点上面导航试试粒子飞散范围</span>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground flex-1 min-w-[110px]">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-foreground/80">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary w-full"
      />
    </label>
  );
}

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [liveActive, setLiveActive] = useState(0);
  const [presetActive, setPresetActive] = useState<Record<string, number>>({ 收敛: 0, 当前: 0, 明显: 0, 夸张: 0 });

  const set = (patch: Partial<Params>) => setParams((p) => ({ ...p, ...patch }));

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
  };

  const liveItems = useMemo<GooeyNavItem[]>(
    () =>
      tabs.map((tab, i) => {
        const Icon = tab.icon;
        return {
          label: tab.label,
          href: `/${tab.id}`,
          icon: <Icon size={14} key={String(i === liveActive)} className={i === liveActive ? "animate-tab-icon-bounce" : ""} />,
        };
      }),
    [liveActive]
  );

  return (
    <div className="min-h-screen">
      {/* Aurora 背景,与真实页面一致 */}
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-15">
        <Aurora colorStops={["#e8a838", "#f59e0b", "#e8a838"]} amplitude={0.15} blend={0.8} speed={0.2} />
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Mock header */}
        <header className="flex items-center justify-between py-3 sm:py-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">X</span>
            </div>
            <span className="font-semibold text-sm">Xplora · 参数实验室</span>
          </div>
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </header>

        {/* ── 实时调节 ── */}
        <div className="section-card mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {Object.entries(PRESETS).map(([name, p]) => (
              <button
                key={name}
                className={`pill ${params === p ? "active" : ""}`}
                onClick={() => setParams({ ...p })}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <Slider label="粒子数量" value={params.particleCount} min={2} max={30} onChange={(v) => set({ particleCount: v })} />
            <Slider label="外圈距离" value={params.distances[0]} min={10} max={160} onChange={(v) => set({ distances: [v, params.distances[1]] })} />
            <Slider label="内圈距离" value={params.distances[1]} min={2} max={40} onChange={(v) => set({ distances: [params.distances[0], v] })} />
            <Slider label="旋转半径" value={params.particleR} min={15} max={110} onChange={(v) => set({ particleR: v })} />
            <Slider label="时长方差" value={params.timeVariance} min={80} max={400} onChange={(v) => set({ timeVariance: v })} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <Slider label="主动画时长" value={params.animationTime} min={300} max={800} step={10} onChange={(v) => set({ animationTime: v })} />
          </div>
          <div className="max-sm:hidden mb-5 pb-3 border-b border-border-subtle">
            <GooeyNav
              items={liveItems}
              activeIndex={liveActive}
              onSelect={setLiveActive}
              particleCount={params.particleCount}
              particleDistances={params.distances}
              particleR={params.particleR}
              timeVariance={params.timeVariance}
              animationTime={params.animationTime}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            当前参数(可复制): <code className="font-mono text-primary/90 whitespace-pre">{paramsToProps(params)}</code>
          </p>
        </div>

        {/* ── 并排对比 ── */}
        <h2 className="text-sm font-semibold mb-4 text-muted-foreground">
          并排对比 —— 每行独立点击触发粒子效果
        </h2>
        {Object.entries(PRESETS).map(([name, p]) => (
          <NavRow
            key={name}
            name={name}
            params={p}
            active={presetActive[name] ?? 0}
            onSelect={(i) => setPresetActive((prev) => ({ ...prev, [name]: i }))}
          />
        ))}

        <p className="text-[11px] text-muted-foreground/60 pb-10">
          提示:切到浅色主题观察两种主题下的粒子观感;「收敛」适合低调日常,「夸张」适合演示。
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
