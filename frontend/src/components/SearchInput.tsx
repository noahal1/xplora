interface SearchInputProps {
  /** Current input value. */
  value: string;
  /** Called when the input value changes. */
  onChange: (value: string) => void;
  /** Called when the clear button is clicked. */
  onClear: () => void;
  /** Placeholder text (i18n key already resolved). */
  placeholder: string;
  /** Additional classes for the wrapper div. */
  className?: string;
  /** HTML id attribute for the input. */
  id?: string;
  /** onKeyDown handler (e.g. for Enter to trigger search). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Whether to show the clear button. Defaults to !!value. */
  showClear?: boolean;
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  className = "",
  id,
  onKeyDown,
  showClear,
}: SearchInputProps) {
  const resolvedShowClear = showClear ?? !!value;

  return (
    <div className={`relative flex-1 ${className}`}>
      <input
        type="text"
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="input-field pl-3 pr-8 py-2 h-auto text-sm"
      />
      {resolvedShowClear && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClear}
          tabIndex={-1}
          aria-label="Clear search"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
