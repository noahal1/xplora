import { useTranslation } from "react-i18next";
import type { SortField } from "../types";

interface SortOption {
  field: SortField;
  labelKey: string;
}

interface SortControlsProps {
  /** Currently active sort field. */
  field: SortField;
  /** Current sort direction. */
  dir: "asc" | "desc";
  /** Called when a sort pill is clicked. Parent handles page reset etc. */
  onSort: (field: SortField) => void;
  /** Custom label (defaults to "manage.sort"). */
  label?: string;
}

const DEFAULT_SORT_OPTIONS: SortOption[] = [
  { field: "created_at", labelKey: "manage.sort_import_time" },
  { field: "title", labelKey: "manage.sort_title" },
  { field: "rating", labelKey: "manage.sort_rating" },
  { field: "year", labelKey: "manage.sort_year" },
];

export function SortControls({
  field: sortField,
  dir: sortDir,
  onSort,
  label,
}: SortControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 mb-2 sm:mb-3 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar pb-0.5">
      <span className="text-[11px] text-muted-foreground mr-0.5 max-sm:hidden">
        {label ?? t("manage.sort")}
      </span>
      {DEFAULT_SORT_OPTIONS.map((opt) => {
        const isActive = sortField === opt.field;
        return (
          <button
            key={opt.field}
            className={`pill ${isActive ? "active" : ""}`}
            onClick={() => onSort(opt.field)}
          >
            {t(opt.labelKey)}{" "}
            <span
              className="text-[10px] transition-opacity"
              style={{ opacity: isActive ? 1 : 0.25 }}
            >
              {isActive ? (sortDir === "asc" ? "↑" : "↓") : "↓"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
