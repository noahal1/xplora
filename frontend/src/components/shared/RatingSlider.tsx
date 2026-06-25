/**
 * RatingSlider — unified rating range slider (0–10, step 0.5)
 *
 * Variants:
 *   sm  → compact, for grid cards (w-14, smaller thumb)
 *   md  → medium, for list items & table cells (w-20)
 *   lg  → large, for modals (w-full max-w-xs, tall track, hover effects)
 */

interface RatingSliderProps {
  value: number;
  onChange: (value: number) => void;
  onSave?: () => void;
  size?: "sm" | "md" | "lg";
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Extra class applied to the input element */
  className?: string;
}

const BASE =
  "appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer touch-manipulation " +
  // Thumb (shared)
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
  "[&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:cursor-pointer " +
  "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background " +
  "[&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out " +
  "active:[&::-webkit-slider-thumb]:scale-125 ";

const SIZES: Record<string, string> = {
  sm:
    "w-14 h-1 " +
    "[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 " +
    "max-sm:[&::-webkit-slider-thumb]:w-6 max-sm:[&::-webkit-slider-thumb]:h-6 " +
    "max-sm:h-2",
  md:
    "w-20 h-1 " +
    "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 " +
    "max-sm:[&::-webkit-slider-thumb]:w-6 max-sm:[&::-webkit-slider-thumb]:h-6 " +
    "max-sm:h-2",
  lg:
    "w-full max-w-xs h-1.5 " +
    "[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 " +
    "max-sm:[&::-webkit-slider-thumb]:w-7 max-sm:[&::-webkit-slider-thumb]:h-7 " +
    "[&::-webkit-slider-thumb]:shadow-lg " +
    "[&::-webkit-slider-thumb]:hover:scale-110 " +
    "active:[&::-webkit-slider-thumb]:shadow-amber/40 " +
    "[&::-webkit-slider-track]:h-1.5 [&::-webkit-slider-track]:rounded-full " +
    "max-sm:[&::-webkit-slider-track]:h-2.5",
};

export function RatingSlider({
  value,
  onChange,
  onSave,
  size = "md",
  autoFocus,
  onKeyDown,
  className = "",
}: RatingSliderProps) {
  return (
    <input
      type="range"
      min={0}
      max={10}
      step={0.5}
      value={value}
      onChange={(e) => {
        onChange(parseFloat(e.target.value));
        navigator.vibrate?.(3);
      }}
      onMouseUp={onSave}
      onTouchEnd={onSave}
      onBlur={onSave}
      onKeyDown={onKeyDown}
      className={`${BASE} ${SIZES[size]} ${className}`}
      autoFocus={autoFocus}
    />
  );
}
