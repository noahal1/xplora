import { memo, useRef } from "react";
import { GripVertical, ArrowUp, ArrowDown, Film, Star, Trash2 } from "lucide-react";
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
  const rankColor = getRankColor(idx);

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
          : isTop3
          ? `0 2px 12px ${medal!.shadow}20`
          : "none",
        zIndex: isDragging ? 10 : 1,
      }}
      className="p-0 rounded-2xl overflow-hidden transition-all duration-200"
    >
      {/* Main content row */}
      <div className="flex items-stretch">
        {/* Left accent stripe for ranking */}
        <div
          className="shrink-0 flex flex-col items-center justify-center"
          style={{
            width: isTop3 ? 52 : 40,
            background: isTop3
              ? medal!.bg
              : `${rankColor}12`,
          }}
        >
          {editMode ? (
            <div
              ref={dragHandleRef}
              className="flex flex-col items-center gap-0.5 touch-none cursor-grab active:cursor-grabbing"
              onTouchStart={(e) => { e.stopPropagation(); onTouchStart(e, idx); }}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{ touchAction: "none" }}
            >
              <span
                className="font-extrabold leading-none"
                style={{
                  fontSize: isTop3 ? 17 : 14,
                  color: isTop3 ? "#fff" : rankColor,
                }}
              >
                {idx + 1}
              </span>
              <GripVertical size={12} className={isTop3 ? "text-white/40" : "text-muted-foreground/30"} />
            </div>
          ) : (
            <span
              className="font-extrabold leading-none"
              style={{
                fontSize: isTop3 ? 17 : 14,
                color: isTop3 ? "#fff" : rankColor,
              }}
            >
              {idx + 1}
            </span>
          )}
        </div>

        {/* Poster column */}
        <div
          className="w-[68px] shrink-0 overflow-hidden cursor-pointer relative"
          onClick={() => !editMode && onClick(movie)}
        >
          {movie.poster_url ? (
            <ProgressiveImage
              src={movie.poster_url}
              alt={movie.title}
              className="w-full h-full object-cover absolute inset-0"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted/40">
              <Film size={16} className="text-muted-foreground/20" />
            </div>
          )}
          {/* Subtle gradient overlay on right edge */}
          <div
            className="absolute inset-y-0 right-0 w-3 pointer-events-none"
            style={{
              background: `linear-gradient(to right, transparent, var(--bg-card))`,
            }}
          />
        </div>

        {/* Info + Actions */}
        <div className="flex-1 min-w-0 flex flex-col justify-center py-2.5 pr-2.5 pl-2.5 gap-1">
          {/* Title */}
          <span
            className={`font-semibold text-sm leading-tight line-clamp-2 ${isTop3 ? "bg-clip-text text-transparent" : ""}`}
            style={isTop3 ? {
              backgroundImage: idx === 0
                ? "linear-gradient(135deg, #f59e0b, #eab308)"
                : idx === 1
                ? "linear-gradient(135deg, #94a3b8, #cbd5e1)"
                : "linear-gradient(135deg, #b45309, #d97706)",
            } : {}}
          >
            {movie.title}
          </span>

          {/* Meta row */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-0.5">
              <Star size={9} className="text-amber" fill="currentColor" />
              <span className="font-bold tabular-nums text-amber text-[11px]">{movie.rating.toFixed(1)}</span>
            </div>
            {movie.year && (
              <span className="text-[10px] text-muted-foreground/50">{movie.year}</span>
            )}
          </div>

          {/* Genre tag */}
          {movie.genre && (
            <span className="text-[9px] text-muted-foreground/30 truncate">{movie.genre}</span>
          )}
        </div>

        {/* Right actions column */}
        {!editMode ? (
          <div className="flex flex-col items-center justify-center gap-1 pr-2.5">
            {isTop3 && (
              <span className="text-base leading-none">
                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
              </span>
            )}
            <button
              className="p-1.5 rounded-full text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-all"
              onClick={(e) => { e.stopPropagation(); onRemove(movie); }}
              title="移除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 pr-2.5">
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-all disabled:opacity-15 disabled:pointer-events-none"
              onClick={(e) => { e.stopPropagation(); onMoveUp(idx); }}
              disabled={idx === 0}
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-all disabled:opacity-15 disabled:pointer-events-none"
              onClick={(e) => { e.stopPropagation(); onMoveDown(idx); }}
              disabled={idx === total - 1}
            >
              <ArrowDown size={14} />
            </button>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-all"
              onClick={(e) => { e.stopPropagation(); onRemove(movie); }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
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
