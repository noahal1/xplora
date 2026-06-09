import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Manages a debounced search input.
 *
 * Returns an `input` value that updates instantly for responsive UI, and
 * a `debouncedValue` that only updates after `delay` ms of inactivity.
 *
 * The hook handles timeout cleanup on unmount automatically.
 *
 * @example
 * ```tsx
 * const { input, setInput, debouncedValue } = useDebouncedSearch("", 300);
 *
 * return (
 *   <>
 *     <input value={input} onChange={e => setInput(e.target.value)} />
 *     <Results query={debouncedValue} />
 *   </>
 * );
 * ```
 */
export function useDebouncedSearch(
  initialValue: string = "",
  delay: number = 300,
) {
  const [input, setInput] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync debouncedValue when input changes
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(input);
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [input, delay]);

  const clear = useCallback(() => {
    setInput("");
    setDebouncedValue("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { input, setInput, debouncedValue, clear };
}
