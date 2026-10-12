import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { getSetupStatus } from "../api";

interface SetupContextValue {
  /** True when the instance still needs first-run setup. null = unknown/loading. */
  needsSetup: boolean | null;
  isLoading: boolean;
  /** Re-fetch the setup status (e.g. after completing setup). */
  refresh: () => void;
}

const SetupContext = createContext<SetupContextValue>({
  needsSetup: null,
  isLoading: true,
  refresh: () => {},
});

export function SetupProvider({ children }: { children: ReactNode }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    getSetupStatus()
      .then((data) => setNeedsSetup(data.needs_setup))
      // If the backend lacks the setup route, treat as already configured.
      .catch(() => setNeedsSetup(false))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SetupContext.Provider value={{ needsSetup, isLoading, refresh }}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetup() {
  return useContext(SetupContext);
}
