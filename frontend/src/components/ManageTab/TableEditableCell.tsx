import { memo, useRef, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import { RatingSlider } from "../shared/RatingSlider";

/* ── Reusable editable table cell component ────────────────────

   Rating slider uses LOCAL state so that onChange (frequent on every drag)
   does not flow back through the parent and re-render all other rows.
   The parent's sliderValue prop is only used to INITIALIZE the local state
   when editing starts for THIS cell. ───────────────────────── */
export const TableEditableCell = memo(function TableEditableCell({ movie, field, editingCell, sliderValue, children, onStartEdit, onSaveEdit, onCancelEdit, tdClassName }: {
  movie: MediaDetail;
  field: string;
  editingCell: { movieId: number; field: string } | null;
  sliderValue: number;
  children: React.ReactNode;
  onStartEdit: (movieId: number, field: string) => void;
  onSaveEdit: (movieId: number, field: string, value: string) => Promise<void>;
  onCancelEdit: () => void;
  tdClassName?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingCell?.movieId === movie.id && editingCell?.field === field;

  // Local slider state — initialised from parent when editing starts.
  // useState gives the correct value on first-edit (React batches the
  // parent's setSliderValue + setEditingCell into one render).
  // useEffect syncs on re-edit of the same row (e.g. cancel → re-edit).
  const [localSlider, setLocalSlider] = useState(sliderValue);
  useEffect(() => {
    if (isEditing) setLocalSlider(sliderValue);
  }, [isEditing, sliderValue]);

  const handleSave = useCallback(() => {
    const v = inputRef.current?.value ?? localSlider.toFixed(1);
    onSaveEdit(movie.id, field, v);
  }, [movie.id, field, localSlider, onSaveEdit]);

  const handleRangeSave = useCallback(() => {
    onSaveEdit(movie.id, "rating", localSlider.toFixed(1));
  }, [movie.id, localSlider, onSaveEdit]);

  if (isEditing) {
    if (field === "rating") {
      return (
        <td className={`px-3 py-2 border-b border-border ${tdClassName || ''}`}>
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <RatingSlider
              value={localSlider}
              onChange={(v) => setLocalSlider(v)}
              onSave={handleRangeSave}
              size="md"
              autoFocus
            />
            <span className="text-amber font-medium text-xs min-w-[24px] text-center count-badge" key={localSlider}>
              {localSlider.toFixed(1)}
            </span>
          </span>
        </td>
      );
    }
    let value = "", inputType = "text", widthClass = "";
    switch (field) {
      case "title": value = movie.title; widthClass = "w-full min-w-[120px]"; break;
      case "year": inputType = "number"; widthClass = "w-[72px]"; value = movie.year != null ? movie.year.toString() : ""; break;
      case "created_at": inputType = "date"; widthClass = "w-[110px]"; value = movie.created_at ? movie.created_at.slice(0, 10) : ""; break;
    }
    return (
      <td className={`px-3 py-2 border-b border-border ${tdClassName || ''}`}>
        <div className="flex items-center gap-1">
          <input ref={inputRef} type={inputType} className={`no-spinner ${widthClass} input-field h-7 text-sm px-1.5 py-0.5`}
            defaultValue={value}                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } if (e.key === "Escape") { onCancelEdit(); } }}
            onBlur={handleSave}
            onClick={(e) => e.stopPropagation()} autoFocus />
        </div>
      </td>
    );
  }

  return (      <td className={`px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-accent/30 group ${tdClassName || ''}`}
      onClick={() => onStartEdit(movie.id, field)} title={t("common.edit")}>
      <div className="flex items-center gap-1">
        {children}
        <span className="opacity-0 group-hover:opacity-40 max-sm:opacity-30 transition-opacity">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
        </span>
      </div>
    </td>
  );
}, (prev, next) => {
  // Only re-render editing cell when it's this row's cell being edited
  const thisRow = prev.movie.id;
  const prevEditing = prev.editingCell?.movieId === thisRow && prev.editingCell?.field === prev.field;
  const nextEditing = next.editingCell?.movieId === thisRow && next.editingCell?.field === next.field;
  if (prevEditing !== nextEditing) return false;
  if (nextEditing && prev.sliderValue !== next.sliderValue) return false;
  return true;
});
