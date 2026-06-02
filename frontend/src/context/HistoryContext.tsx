import { createContext, useContext, useState, type ReactNode } from "react";

interface HistoryContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <HistoryContext.Provider value={{ open, setOpen }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error("useHistory must be used within HistoryProvider");
  return ctx;
}
