import { useTranslation } from "react-i18next";

interface ScrapeSourceFilterProps {
  /** Currently selected scrape source. */
  selected: string;
  /** Called when a source pill is clicked. */
  onSelect: (value: string) => void;
}

const SCRAPE_SOURCES = [
  { value: "tmdb", label: "TMDB" },
  { value: "tvmaze", label: "TVmaze" },
] as const;

export function ScrapeSourceFilter({
  selected,
  onSelect,
}: ScrapeSourceFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 mb-3 flex-wrap pb-0.5 max-sm:hidden">
      <span className="text-xs text-muted-foreground mr-1">
        {t("manage.scrape_source")}
      </span>
      {SCRAPE_SOURCES.map((opt) => (
        <button
          key={opt.value}
          className={`pill ${selected === opt.value ? "active" : ""}`}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
