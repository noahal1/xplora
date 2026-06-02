import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

// Common movie genres
const DEFAULT_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Biography",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Musical",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Sport",
  "Thriller",
  "War",
  "Western",
];

interface GenreInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

export function GenreInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  onKeyDown,
  onBlur,
}: GenreInputProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder || t("genre_input.placeholder");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync filter with external value
  useEffect(() => {
    setFilter(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredGenres = DEFAULT_GENRES.filter((g) =>
    g.toLowerCase().includes(filter.toLowerCase())
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setFilter(val);
      onChange(val);
      if (!open) setOpen(true);
    },
    [onChange, open]
  );

  const handleSelectGenre = useCallback(
    (genre: string) => {
      // If there's already a genre, append with " / "
      const newValue = value
        ? value
            .split(" / ")
            .map((s) => s.trim())
            .filter(Boolean)
            .concat([genre])
            .join(" / ")
        : genre;
      onChange(newValue);
      setFilter(newValue);
      setOpen(false);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      const newValue = value
        .split(" / ")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((t) => t !== tagToRemove)
        .join(" / ");
      onChange(newValue);
      setFilter(newValue);
    },
    [value, onChange]
  );

  const clear = useCallback(() => {
    onChange("");
    setFilter("");
    setOpen(false);
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDownInternal = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && open && filteredGenres.length > 0) {
        e.preventDefault();
        handleSelectGenre(filteredGenres[0]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Backspace" && !filter && value) {
        // Remove last tag on backspace if filter is empty
        const tags = value
          .split(" / ")
          .map((s) => s.trim())
          .filter(Boolean);
        if (tags.length > 0) {
          handleRemoveTag(tags[tags.length - 1]);
        }
        return;
      }
      onKeyDown?.(e);
    },
    [open, filteredGenres, filter, value, handleSelectGenre, handleRemoveTag, onKeyDown]
  );

  const handleBlur = useCallback(() => {
    // Small delay to allow click on dropdown items
    setTimeout(() => {
      onBlur?.();
    }, 150);
  }, [onBlur]);

  const tags = value
    ? value
        .split(" / ")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-1 min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          open && "border-ring ring-[3px] ring-ring/50"
        )}
      >
        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary border border-primary/20"
              >
                {tag}
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm hover:bg-primary/20 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTag(tag);
                  }}
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDownInternal}
          onBlur={handleBlur}
          placeholder={tags.length > 0 ? "" : resolvedPlaceholder}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent outline-none text-sm min-w-[60px] placeholder:text-muted-foreground"
        />
        {/* Clear button */}
        {value && (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={clear}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        )}
        {/* Dropdown arrow */}
        <button
          type="button"
          className={cn(
            "shrink-0 text-muted-foreground/50 transition-transform",
            open && "rotate-180"
          )}
          onClick={() => setOpen(!open)}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-lg border border-border bg-popover text-popover-foreground shadow-md overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="max-h-[200px] overflow-y-auto p-1.5 space-y-0.5">
            {filteredGenres.length > 0 ? (
              filteredGenres.map((genre) => {
                const isSelected = tags.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                      isSelected
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-foreground"
                    )}
                    onClick={() => handleSelectGenre(genre)}
                  >
                    {genre}
                    {isSelected && (
                      <svg className="w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                {t("genre_input.custom_type")}
              </div>
            )}
          </div>
          {/* Footer with hint */}
          <div className="border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground flex items-center gap-2">
            <span>{t("genre_input.enter_select")}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>{t("genre_input.separate_hint")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
