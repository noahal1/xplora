import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Award, Star, Pin, PinOff, EyeOff, Film, Trophy,
  GripVertical, Pencil, Check, ArrowUp, ArrowDown,
} from "lucide-react";
import FadeContent from "./FadeContent";
import { ProgressiveImage } from "./ProgressiveImage";
import { DetailModal } from "./ManageTab/DetailModal";
import { fetchTopRated, togglePin, toggleHide, reorderTopRated } from "../api";
import type { MediaDetail } from "../types";

const MEDAL_COLORS = [
  { bg: "linear-gradient(135deg, #f59e0b, #eab308)", shadow: "rgba(245,158,11,0.4)" },
  { bg: "linear-gradient(135deg, #94a3b8, #cbd5e1)", shadow: "rgba(148,163,184,0.4)" },
  { bg: "linear-gradient(135deg, #b45309, #d97706)", shadow: "rgba(180,83,9,0.4)" },
];

function getRankColor(index: number): string {
  if (index < 3) return "#f59e0b";
  if (index < 6) return "#3b82f6";
  return "#8b5cf6";
}

export function TopRatedTab() {
  const { t } = useTranslation();
  const [movies, setMovies] = useState<MediaDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailMovie, setDetailMovie] = useState<MediaDetail | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [animated, setAnimated] = useState(false);
  const dragItem = useRef<HTMLDivElement>(null);

  // Trigger entrance animation after mount
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTopRated();
      setMovies(data);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTogglePin = async (id: number) => {
    try {
      const result = await togglePin(id);
      setMovies((prev) =>
        prev.map((m) => (m.id === id ? { ...m, pinned: result.pinned, hidden_from_top: false, sort_order: null } : m))
      );
    } catch { /* ignore */ }
  };

  const handleToggleHide = async (id: number) => {
    try {
      const result = await toggleHide(id);
      if (result.hidden_from_top) {
        setMovies((prev) => prev.filter((m) => m.id !== id));
      }
    } catch { /* ignore */ }
  };

  // ── Drag & Drop ──────────────────────────────────────────

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  };

  const handleDragEnd = async () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }

    const reordered = [...movies];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(overIdx, 0, moved);
    setMovies(reordered);
    setDragIdx(null);
    setOverIdx(null);

    // Persist
    setSaving(true);
    try {
      await reorderTopRated(reordered.map((m) => m.id));
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    const reordered = [...movies];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    setMovies(reordered);
    setSaving(true);
    reorderTopRated(reordered.map((m) => m.id)).finally(() => setSaving(false));
  };

  const handleMoveDown = (idx: number) => {
    if (idx === movies.length - 1) return;
    const reordered = [...movies];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    setMovies(reordered);
    setSaving(true);
    reorderTopRated(reordered.map((m) => m.id)).finally(() => setSaving(false));
  };

  const toggleEditMode = () => {
    if (editMode) {
      // Exiting edit mode — save current order
      setSaving(true);
      reorderTopRated(movies.map((m) => m.id)).finally(() => setSaving(false));
    }
    setEditMode(!editMode);
  };

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <FadeContent className="section-card">
        <div className="flex items-center justify-center py-20">
          <div className="relative">
            <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Trophy size={14} className="text-primary/60" />
            </div>
          </div>
        </div>
      </FadeContent>
    );
  }

  if (error) {
    return (
      <FadeContent className="section-card">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Award size={40} className="opacity-20" />
          <p className="text-sm opacity-60">{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={loadData}>重试</button>
        </div>
      </FadeContent>
    );
  }

  if (movies.length === 0) {
    return (
      <FadeContent className="section-card">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Trophy size={48} className="opacity-10" />
          <p className="text-sm opacity-40">还没有足够的已看电影来生成榜单</p>
        </div>
      </FadeContent>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <FadeContent className="section-card">
        <div className="section-header">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #f59e0b, #eab308)" }}
            >
              <Trophy size={14} className="text-white" />
            </div>
            <h2 className="section-title">Top 排行榜</h2>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] animate-pulse opacity-40">保存中...</span>}
            {editMode && (
              <span className="text-[10px] opacity-40">拖拽或点击上下箭头排序</span>
            )}
            <button
              className={`btn btn-xs ${editMode ? "btn-primary" : "btn-ghost"}`}
              onClick={toggleEditMode}
            >
              {editMode ? (
                <><Check size={12} className="mr-1" />完成</>
              ) : (
                <><Pencil size={12} className="mr-1" />编辑排序</>
              )}
            </button>
            <button className="btn btn-ghost btn-xs" onClick={loadData} title="刷新">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>
        </div>
      </FadeContent>

      {/* ── Movie List ─────────────────────────────── */}
      <div className="space-y-3 sm:space-y-4">
        {movies.map((movie, idx) => {
          const isTop3 = idx < 3;
          const medal = isTop3 ? MEDAL_COLORS[idx] : null;
          const delay = idx * 60;
          const fromLeft = idx % 2 === 0;

          return (
            <div
              key={movie.id}
              ref={dragIdx === idx ? dragItem : undefined}
              draggable={editMode}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => !editMode && setDetailMovie(movie)}
              style={{
                transform: animated
                  ? "translateX(0) scale(1)"
                  : `translateX(${fromLeft ? "-60px" : "60px"}) scale(0.95)`,
                opacity: animated ? 1 : 0,
                transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
                cursor: editMode ? "grab" : "pointer",
                borderColor: overIdx === idx ? "var(--seed-primary, #f59e0b)" : undefined,
                boxShadow: overIdx === idx ? "0 0 0 2px var(--seed-primary, #f59e0b)" : undefined,
              }}
              className="group relative rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            >
              {/* Card background */}
              <div
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4"
                style={{
                  background: isTop3
                    ? `linear-gradient(135deg, ${idx === 0 ? "rgba(245,158,11,0.08)" : "rgba(148,163,184,0.05)"}, transparent)`
                    : "var(--bg-card)",
                  border: `1px solid ${
                    isTop3 ? `rgba(245,158,11,${idx === 0 ? "0.25" : "0.1"})` : "var(--border-default)"
                  }`,
                }}
              >
                {/* Drag handle (edit mode) */}
                {editMode && (
                  <div className="flex flex-col gap-0.5 shrink-0 touch-none">
                    <button
                      className="w-6 h-5 flex items-center justify-center rounded hover:bg-accent/30 transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleMoveUp(idx); }}
                      disabled={idx === 0}
                    >
                      <ArrowUp size={12} className="opacity-40" />
                    </button>
                    <div className="w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing">
                      <GripVertical size={14} className="opacity-30" />
                    </div>
                    <button
                      className="w-6 h-5 flex items-center justify-center rounded hover:bg-accent/30 transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleMoveDown(idx); }}
                      disabled={idx === movies.length - 1}
                    >
                      <ArrowDown size={12} className="opacity-40" />
                    </button>
                  </div>
                )}

                {/* Rank badge */}
                <div className="shrink-0 relative">
                  {isTop3 && medal ? (
                    <div
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg"
                      style={{ background: medal.bg, boxShadow: `0 2px 12px ${medal.shadow}` }}
                    >
                      {idx + 1}
                    </div>
                  ) : (
                    <div
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: `${getRankColor(idx)}15`, color: getRankColor(idx) }}
                    >
                      {idx + 1}
                    </div>
                  )}
                </div>

                {/* Mini poster */}
                <div
                  className="w-10 h-14 sm:w-12 sm:h-16 rounded-lg overflow-hidden shrink-0"
                  style={{
                    ...(isTop3 ? { boxShadow: "0 2px 8px rgba(0,0,0,0.15)" } : {}),
                    opacity: animated ? 1 : 0,
                    transform: animated ? "scale(1)" : "scale(0.85)",
                    transition: `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${delay + 100}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${delay + 100}ms`,
                  }}
                >
                  {movie.poster_url ? (
                    <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" wrapperClassName="!aspect-auto !h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-input)" }}>
                      <Film size={14} className="opacity-20" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-semibold truncate">
                      {isTop3 ? (
                        <span
                          className="bg-clip-text text-transparent"
                          style={{
                            backgroundImage: idx === 0
                              ? "linear-gradient(135deg, #f59e0b, #eab308)"
                              : idx === 1
                              ? "linear-gradient(135deg, #94a3b8, #cbd5e1)"
                              : "linear-gradient(135deg, #b45309, #d97706)",
                          }}
                        >
                          {movie.title}
                        </span>
                      ) : (
                        movie.title
                      )}
                    </span>
                    {movie.pinned && <Pin size={10} className="text-amber shrink-0" fill="currentColor" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Star size={11} className="text-amber" fill="currentColor" />
                      <span className="text-xs font-bold tabular-nums text-amber">{movie.rating.toFixed(1)}</span>
                    </div>
                    {movie.year && <span className="text-[10px] opacity-40">{movie.year}</span>}
                    {movie.genre && (
                      <span className="text-[10px] opacity-30 truncate max-w-[120px] sm:max-w-[200px]">{movie.genre}</span>
                    )}
                  </div>
                </div>

                {/* Actions (non-edit mode) */}
                {!editMode && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent/30 transition-all"
                      onClick={() => handleTogglePin(movie.id)}
                      title={movie.pinned ? "取消置顶" : "置顶"}
                    >
                      {movie.pinned ? <PinOff size={12} className="text-amber" /> : <Pin size={12} className="opacity-40" />}
                    </button>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent/30 transition-all"
                      onClick={() => handleToggleHide(movie.id)}
                      title="隐藏"
                    >
                      <EyeOff size={12} className="opacity-40" />
                    </button>
                  </div>
                )}

                {/* Medal emoji for top 3 (non-edit mode) */}
                {!editMode && isTop3 && (
                  <span className="text-lg shrink-0 ml-1">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      <DetailModal
        open={detailMovie !== null}
        movie={detailMovie}
        onClose={() => setDetailMovie(null)}
      />
    </div>
  );
}
