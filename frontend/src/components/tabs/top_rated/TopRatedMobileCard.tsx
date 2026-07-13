import { memo, useRef } from "react";
import { ArrowUp, ArrowDown, Film, Star, Trash2 } from "lucide-react";
import type { MediaDetail } from "../../../types";
import { ProgressiveImage } from "../../ProgressiveImage";

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

interface TopRatedMobileCardProps {
  movie: MediaDetail;
  index: number;
  total: number;
  editMode: boolean;
  animated: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onTouchStart: (e: React.TouchEvent, idx: number) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
  onRemove: (movie: MediaDetail) => void;
  onClick: (movie: MediaDetail) => void;
}

export const TopRatedMobileCard = memo(function TopRatedMobileCard({
  movie, index: idx, total, editMode, animated,
  isDragging, isDragOver,
  onTouchStart, onTouchMove, onTouchEnd,
  onMoveUp, onMoveDown, onRemove, onClick,
}: TopRatedMobileCardProps) {
  const isTop3 = idx < 3;
  const medal = isTop3 ? MEDAL_COLORS[idx] : null;
  const delay = idx * 60;
  const dragHandleRef = useRef<HTMLDivElement>(null);

  return (
    <div
      onClick={() => !editMode && onClick(movie)}
      style={{
        transform: animated
          ? isDragging
            ? "translateX(0) scale(1.02)"
            : "translateX(0) scale(1)"
          : `translateX(${idx % 2 === 0 ? "-30px" : "30px"}) scale(0.95)`,
        opacity: animated ? (isDragging ? 0.6 : 1) : 0,
        transition: isDragging
          ? "opacity 0.15s ease, transform 0.15s ease"
          : `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        background: isDragOver && !isDragging
          ? "var(--accent)"
          : "var(--bg-card)",
        border: `1px solid ${
          isDragOver && !isDragging
            ? "var(--seed-primary, #f59e0b)"
            : isDragging
            ? "var(--seed-primary, #f59e0b)"
            : "var(--border-default)"
        }`,
        boxShadow: isDragOver && !isDragging
          ? "0 0 0 2px var(--seed-primary, #f59e0b)"
          : isDragging
          ? "0 4px 16px rgba(0,0,0,0.25)"
          : "none",
        zIndex: isDragging ? 10 : 1,
      }}
      className="p-3 rounded-xl transition-all duration-200 active:scale-[0.99]"
    >
      {/* Row 1: Rank + Poster + Title/Meta + Actions */}
      <div className="flex items-start gap-2.5">
        {/* Rank badge — also serves as drag handle in edit mode */}
        {editMode ? (
          <div
            ref={dragHandleRef}
            className="shrink-0 relative mt-0.5 touch-none cursor-grab active:cursor-grabbing"
            onTouchStart={(e) => { e.stopPropagation(); onTouchStart(e, idx); }}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{ touchAction: "none" }}
          >
            {isTop3 && medal ? (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
                style={{ background: medal.bg, boxShadow: `0 2px 8px ${medal.shadow}` }}
              >
                {idx + 1}
              </div>
            ) : (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
                style={{ background: `${getRankColor(idx)}15`, color: getRankColor(idx) }}
              >
                {idx + 1}
              </div>
            )}
            {/* Drag grip indicator dots */}
            <div className="flex justify-center gap-0.5 mt-0.5 opacity-40">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                <circle cx="9" cy="5" r="1" /><circle cx="15" cy="5" r="1" />
                <circle cx="9" cy="19" r="1" /><circle cx="15" cy="19" r="1" />
              </svg>
            </div>
          </div>
        ) : (
          <div className="shrink-0 relative mt-0.5">
            {isTop3 && medal ? (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
                style={{ background: medal.bg, boxShadow: `0 2px 8px ${medal.shadow}` }}
              >
                {idx + 1}
              </div>
            ) : (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
                style={{ background: `${getRankColor(idx)}15`, color: getRankColor(idx) }}
              >
                {idx + 1}
              </div>
            )}
          </div>
        )}

        {/* Poster */}
        <div
          className="w-10 h-[58px] shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center cursor-pointer border border-border-subtle"
          onClick={() => !editMode && onClick(movie)}
        >
          {movie.poster_url ? (
            <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
          ) : (
            <Film size={16} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-medium text-sm truncate ${isTop3 ? "bg-clip-text text-transparent" : ""}`}
                  style={isTop3 ? {
                    backgroundImage: idx === 0
                      ? "linear-gradient(135deg, #f59e0b, #eab308)"
                      : idx === 1
                      ? "linear-gradient(135deg, #94a3b8, #cbd5e1)"
                      : "linear-gradient(135deg, #b45309, #d97706)",
                  } : {}}
                  onClick={() => !editMode && onClick(movie)}
                >
                  {movie.title}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/80">
                <div className="flex items-center gap-1">
                  <Star size={10} className="text-amber" fill="currentColor" />
                  <span className="text-xs font-bold tabular-nums text-amber">{movie.rating.toFixed(1)}</span>
                </div>
                {movie.year && <span className="text-[10px] opacity-40">{movie.year}</span>}
                {movie.genre && (
                  <span className="text-[10px] opacity-30 truncate max-w-[80px]">{movie.genre}</span>
                )}
              </div>
            </div>

            {/* Medal emoji + Remove (non-edit mode) */}
            {!editMode && (
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                {isTop3 && (
                  <span className="text-base leading-none">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                  </span>
                )}
                <button
                  className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all"
                  onClick={(e) => { e.stopPropagation(); onRemove(movie); }}
                  title="移除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Edit mode controls (when editing) */}
      {editMode && (
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 overflow-x-auto no-scrollbar" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {/* Drag handle hint */}
          <div className="flex items-center gap-1 px-2 py-1 text-[10px] opacity-40">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
              <circle cx="9" cy="5" r="1" /><circle cx="15" cy="5" r="1" />
              <circle cx="9" cy="19" r="1" /><circle cx="15" cy="19" r="1" />
            </svg>
            <span>拖拽排名徽章排序</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <button
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              onClick={(e) => { e.stopPropagation(); onMoveUp(idx); }}
              disabled={idx === 0}
            >
              <ArrowUp size={13} />
              <span>上移</span>
            </button>
            <button
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
              onClick={(e) => { e.stopPropagation(); onMoveDown(idx); }}
              disabled={idx === total - 1}
            >
              <ArrowDown size={13} />
              <span>下移</span>
            </button>
            <button
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); onRemove(movie); }}
            >
              <Trash2 size={13} />
              <span>移除</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  const id = prev.movie.id;
  if (prev.movie.title !== next.movie.title) return false;
  if (prev.movie.rating !== next.movie.rating) return false;
  if (prev.movie.year !== next.movie.year) return false;
  if (prev.movie.genre !== next.movie.genre) return false;
  if (prev.movie.poster_url !== next.movie.poster_url) return false;
  if (prev.index !== next.index) return false;
  if (prev.editMode !== next.editMode) return false;
  if (prev.animated !== next.animated) return false;
  if (prev.total !== next.total) return false;
  if (prev.isDragging !== next.isDragging) return false;
  if (prev.isDragOver !== next.isDragOver) return false;
  return true;
});
