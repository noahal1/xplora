import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { getEnrichStatus } from "../api";

interface EnrichProgress {
  total: number;
  enriched: number;
  failed: number;
  processed: number;
  pending: number;
}

interface EnrichContextValue {
  /** Whether scraping is currently in progress (pending > 0 and we're polling) */
  isEnriching: boolean;
  /** Current progress stats, or null if not scraping */
  progress: EnrichProgress | null;
  /** Start polling for enrichment status — call after an import */
  startPolling: () => void;
  /** Forcefully stop polling and dismiss progress UI */
  stopPolling: () => void;
  /** Force a one-time status check */
  checkStatus: () => Promise<void>;
}

const EnrichContext = createContext<EnrichContextValue>({
  isEnriching: false,
  progress: null,
  startPolling: () => {},
  stopPolling: () => {},
  checkStatus: async () => {},
});

const POLL_INTERVAL = 4000; // 4 seconds
const MAX_POLL_DURATION = 10 * 60 * 1000; // 10 minutes max — large imports can take a while

/**
 * Threshold for detecting a stale / dead enrichment task.
 * If the ``processed`` count doesn't change for this many
 * milliseconds, we assume the backend tasks were lost
 * (server restart, etc.) and auto-stop polling.
 *
 * Note that a single item can take 20-30+ seconds on slow
 * networks because each of the 5 parallel sources uses a
 * 15-second connect timeout. Using wall-clock time rather
 * than poll counts avoids false positives from variable
 * poll timing.
 */
const STALLED_TIMEOUT_MS = 90_000; // 90 seconds without progress

export function EnrichProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<EnrichProgress | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startTimeRef = useRef<number>(0);
  const lastProcessedRef = useRef<number>(-1);
  const lastProgressTimeRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = undefined;
    }
    setIsEnriching(false);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getEnrichStatus();
      setProgress(data);

      if (data.pending === 0) {
        // All done!
        toast.dismiss("enrich-progress");
        if (data.total > 0) {
          const parts: string[] = [];
          if (data.enriched > 0) parts.push(`${data.enriched} 部更新成功`);
          if (data.failed > 0) parts.push(`${data.failed} 部未匹配（可查看管理页筛选）`);
          toast.success(parts.join("，") || "海报更新完成", {
            id: "enrich-progress",
          });
        }
        stopPolling();
        // Trigger a page refresh event so components can reload their data
        window.dispatchEvent(new CustomEvent("enrich-done"));
      } else if (Date.now() - startTimeRef.current > MAX_POLL_DURATION) {
        // Total time budget exhausted — stop polling silently and
        // dispatch enrich-done so the UI refreshes with what we have
        window.dispatchEvent(new CustomEvent("enrich-done"));
        stopPolling();
        setProgress(null);
      } else {
        // Update the toast with current progress
        const now = Date.now();
        const didProgress = lastProcessedRef.current >= 0 &&
          data.processed !== lastProcessedRef.current;

        if (didProgress) {
          // Progress was made — reset stall timer
          lastProgressTimeRef.current = now;
          lastProcessedRef.current = data.processed;
        } else if (lastProcessedRef.current >= 0) {
          // No progress — check wall-clock time since last change
          if (now - lastProgressTimeRef.current >= STALLED_TIMEOUT_MS) {
            // Stalled too long — assume backend tasks are dead.
            // Dispatch enrich-done so the UI refreshes (the backend
            // may still finish for items already in-flight).
            window.dispatchEvent(new CustomEvent("enrich-done"));
            toast.dismiss("enrich-progress");
            stopPolling();
            setProgress(null);
            return;
          }
        } else {
          // First poll: set baseline
          lastProcessedRef.current = data.processed;
          lastProgressTimeRef.current = now;
        }

        const pct = data.total > 0
          ? Math.round((data.processed / data.total) * 100)
          : 0;
        const failHint = data.failed > 0 ? ` (${data.failed} 失败)` : "";
        toast.loading(
          `正在更新海报信息 ${data.processed}/${data.total} (${pct}%)${failHint}`,
          { id: "enrich-progress" }
        );
      }
    } catch {
      // Silently retry on next poll
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    // Stop any existing polling
    stopPolling();

    startTimeRef.current = Date.now();
    lastProcessedRef.current = -1;
    lastProgressTimeRef.current = 0;
    setIsEnriching(true);

    // Initial fetch
    fetchStatus();

    // Poll periodically
    pollTimerRef.current = setInterval(fetchStatus, POLL_INTERVAL);
  }, [stopPolling, fetchStatus]);

  const checkStatus = useCallback(async () => {
    try {
      const data = await getEnrichStatus();
      setProgress(data);
      if (data.pending > 0) {
        startPolling();
      }
    } catch {
      // silent
    }
  }, [startPolling]);

  // On mount, check if there's an ongoing enrichment that survived a page refresh.
  // This reattaches polling to background tasks that were started before the
  // page reloaded, so the user sees the progress bar and gets the "done" event.
  useEffect(() => {
    checkStatus();
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [checkStatus]);

  return (
    <EnrichContext.Provider
      value={{ isEnriching, progress, startPolling, stopPolling, checkStatus }}
    >
      {children}
    </EnrichContext.Provider>
  );
}

export function useEnrich() {
  return useContext(EnrichContext);
}
