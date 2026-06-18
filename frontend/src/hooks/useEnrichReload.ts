import { useEffect, useRef } from "react";

/**
 * Subscribes to the `enrich-done` custom event dispatched by the EnrichContext
 * when background metadata enrichment completes. Calls the provided callback
 * so the component can refresh its data.
 *
 * Uses a ref internally to hold the latest callback so the event listener is
 * only registered once (on mount) and torn down once (on unmount), regardless
 * of how often the callback reference changes.
 *
 * @example
 * ```tsx
 * // Increment a reload trigger counter:
 * useEnrichReload(() => setReloadTrigger((n) => n + 1));
 *
 * // Call a specific refresh function:
 * useEnrichReload(() => fetchData());
 * ```
 */
export function useEnrichReload(onTrigger: () => void) {
  // Keep a ref to the latest callback so the event listener is stable
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  useEffect(() => {
    const handler = () => onTriggerRef.current();
    window.addEventListener("enrich-done", handler);
    return () => window.removeEventListener("enrich-done", handler);
  }, []);
}
