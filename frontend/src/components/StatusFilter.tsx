import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";

interface StatusFilterProps {
  /** Current status filter value (e.g. "", "watched", "wish"). */
  status: string;
  /** Current error filter state (only toggled on/off). */
  error: boolean;
  /** Called when a status pill is clicked. Parent handles mutual exclusivity + side effects. */
  onStatusChange: (status: string) => void;
  /** Called when the error pill is clicked. Parent handles toggle + side effects. */
  onErrorToggle: () => void;
}

const STATUS_OPTIONS = [
  { value: "", labelKey: "manage.filter_all" },
  { value: "watched", labelKey: "manage.filter_watched" },
  { value: "wish", labelKey: "manage.filter_wish" },
] as const;

export function StatusFilter({
  status,
  error,
  onStatusChange,
  onErrorToggle,
}: StatusFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 mb-2 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar pb-0.5">
      <span className="text-xs text-muted-foreground mr-1 max-sm:hidden">
        {t("manage.filter")}
      </span>
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`pill ${status === opt.value ? "active" : ""}`}
          onClick={() => onStatusChange(opt.value)}
        >
          {t(opt.labelKey)}
        </button>
      ))}
      <span className="w-[1px] h-3.5 bg-border mx-0.5" />
      <button
        className={`pill ${error ? "active text-destructive border-destructive/30" : ""}`}
        onClick={onErrorToggle}
      >
        <AlertCircle size={11} className="mr-1" />
        {t("manage.filter_errors")}
      </button>
    </div>
  );
}
