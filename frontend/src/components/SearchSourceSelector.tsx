import { useTranslation } from "react-i18next";

interface SearchSourceSelectorProps {
  /** Currently selected search source value. */
  selected: string;
  /** Called when a source button is clicked. */
  onSelect: (value: string) => void;
}

const SOURCES = [
  { value: "auto", labelKey: "search_source.auto" },
  { value: "tmdb", labelKey: "search_source.tmdb" },
  { value: "tvmaze", labelKey: "search_source.tvmaze" },
] as const;

export function SearchSourceSelector({
  selected,
  onSelect,
}: SearchSourceSelectorProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-1 rounded-lg p-0.5"
      style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)" }}
    >
      {SOURCES.map((opt) => (
        <button
          key={opt.value}
          className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
            selected === opt.value
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onSelect(opt.value)}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
