import { useTranslation } from "react-i18next";

interface MediaTypeFilterProps {
  /** Currently selected media type value. */
  selected: string;
  /** Called when a media type pill is clicked. */
  onSelect: (value: string) => void;
  /**
   * The value that represents "all" (i.e. no filter).
   * @default "all"
   */
  allValue?: string;
  /** Additional classes for the wrapper div. */
  className?: string;
}

const MEDIA_TYPES = [
  { value: "all", labelKey: "manage.media_type_all" },
  { value: "movie", labelKey: "manage.media_type_movie" },
  { value: "tv", labelKey: "manage.media_type_tv" },
] as const;

export function MediaTypeFilter({
  selected,
  onSelect,
  allValue = "all",
  className = "",
}: MediaTypeFilterProps) {
  const { t } = useTranslation();

  return (
    <div className={`flex items-center gap-1 mb-2 sm:mb-3 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar pb-0.5 ${className}`}>
      <span className="text-xs text-muted-foreground mr-1 max-sm:hidden">
        {t("manage.media_type")}
      </span>
      {MEDIA_TYPES.map((opt) => {
        const value = opt.value === "all" ? allValue : opt.value;
        return (
          <button
            key={opt.value}
            className={`pill ${selected === value ? "active" : ""}`}
            onClick={() => onSelect(value)}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
