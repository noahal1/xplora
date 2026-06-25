import { GripVertical, ArrowUp, ArrowDown, Film, Star, Trash2 } from "lucide-react";
import type { MediaDetail } from "../../../types";
import AnimatedContent from "../../AnimatedContent";
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

interface TopRatedCardProps {
  movie: MediaDetail;
  index: number;
  total: number;
  editMode: boolean;
  animated: boolean;
  isDragOver: boolean;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDragEnd: () => void;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
  onRemove: (movie: MediaDetail) => void;
  onClick: (movie: MediaDetail) => void;
}

export function TopRatedCard({
  movie, index: idx, total, editMode, animated, isDragOver,
  onDragStart, onDragOver, onDragEnd,
  onMoveUp, onMoveDown, onRemove, onClick,
}: TopRatedCardProps) {
  const isTop3 = idx < 3;
  const medal = isTop3 ? MEDAL_COLORS[idx] : null;
  const delay = idx * 60;
  const fromLeft = idx % 2 === 0;

  return (
    <div
      draggable={editMode}
      onDragStart={() => onDragStart(idx)}
      onDragOver={(e) => onDragOver(e, idx)}
      onDragEnd={onDragEnd}
      onClick={() => !editMode && onClick(movie)}
      style={{
        transform: animated
          ? "translateX(0) scale(1)"
          : `translateX(${fromLeft ? "-60px" : "60px"}) scale(0.95)`,
        opacity: animated ? 1 : 0,
        transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        cursor: editMode ? "grab" : "pointer",
        borderColor: isDragOver ? "var(--seed-primary, #f59e0b)" : undefined,
        boxShadow: isDragOver ? "0 0 0 2px var(--seed-primary, #f59e0b)" : undefined,
      }}
      className="group relative rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
    >
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
              onClick={(e) => { e.stopPropagation(); onMoveUp(idx); }}
              disabled={idx === 0}
            >
              <ArrowUp size={12} className="opacity-40" />
            </button>
            <div className="w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing">
              <GripVertical size={14} className="opacity-30" />
            </div>
            <button
              className="w-6 h-5 flex items-center justify-center rounded hover:bg-accent/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); onMoveDown(idx); }}
              disabled={idx === total - 1}
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

        {/* Mini poster with bounce entrance */}
        <AnimatedContent
          className="w-10 h-14 sm:w-12 sm:h-16 rounded-lg overflow-hidden shrink-0"
          style={{
            ...(isTop3 ? { boxShadow: "0 2px 8px rgba(0,0,0,0.15)" } : {}),
          }}
          distance={60}
          direction="vertical"
          duration={0.7}
          ease="back.out(1.7)"
          scale={0.3}
          initialOpacity={0}
          animateOpacity={true}
          threshold={0}
          delay={idx * 0.04}
        >
          {movie.poster_url ? (
            <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" wrapperClassName="!aspect-auto !h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-input)" }}>
              <Film size={14} className="opacity-20" />
            </div>
          )}
        </AnimatedContent>

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

        {/* Medal emoji for top 3 (non-edit mode) */}
        {!editMode && isTop3 && (
          <span className="text-lg shrink-0 ml-1">
            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
          </span>
        )}

        {/* Remove button (non-edit mode) */}
        {!editMode && (
          <button
            className="opacity-0 group-hover:opacity-40 hover:!opacity-80 shrink-0 p-1 rounded transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(movie);
            }}
            title="从排行榜移除"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
