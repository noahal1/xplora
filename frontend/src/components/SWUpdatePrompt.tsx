import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

/** Banner shown when a new Service Worker is waiting to activate. */
export function SWUpdatePrompt() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = () => setAvailable(true);
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  const handleUpdate = () => {
    const reg = (window as any).__swRegistration?.current as ServiceWorkerRegistration | null;
    if (!reg?.waiting) return;
    // SKIP_WAITING → SW activates → controllerchange → main.tsx reloads
    reg.waiting.postMessage({ type: "SKIP_WAITING" });
  };

  if (!available || dismissed) return null;

  return (
    <div
      className="relative flex items-center justify-between gap-3 px-3 sm:px-4 py-2 rounded-xl mb-2 sm:mb-3 text-xs sm:text-sm animate-fade-in"
      style={{
        background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.08))",
        border: "1px solid rgba(59,130,246,0.25)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">🔄</span>
        <span className="truncate">{t("pwa_update.available")}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleUpdate}
          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-90"
          style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          {t("pwa_update.update")}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
        >
          {t("pwa_update.dismiss")}
        </button>
      </div>
    </div>
  );
}
