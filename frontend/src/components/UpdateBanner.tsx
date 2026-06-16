import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { checkUpdate } from "../api";
import { UpdateModal } from "./UpdateModal";

interface UpdateInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  release_notes: string | null;
  published_at: string | null;
  error: string | null;
}

export function UpdateBanner() {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchUpdate = useCallback(async (force?: boolean) => {
    setLoading(true);
    try {
      const info = await checkUpdate(force);
      setUpdateInfo(info);
    } catch {
      // Silently fail — update check is non-critical
      setUpdateInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpdate();
    // Re-check every 6 hours
    const interval = setInterval(() => fetchUpdate(), 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUpdate]);

  // Don't show banner if: loading, no info, up-to-date, dismissed, or error
  if (loading || !updateInfo || !updateInfo.update_available || dismissed || updateInfo.error) {
    return null;
  }

  return (
    <>
      <div
        className="relative flex items-center justify-between gap-3 px-3 sm:px-4 py-2 rounded-xl mb-2 sm:mb-3 text-xs sm:text-sm animate-fade-in"
        style={{
          background: "linear-gradient(135deg, rgba(234,179,8,0.12), rgba(245,158,11,0.08))",
          border: "1px solid rgba(234,179,8,0.25)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">🚀</span>
          <span className="truncate">
            {t("update.available", { latest: updateInfo.latest_version })}
          </span>
          <span className="text-muted-foreground shrink-0 hidden sm:inline">
            · v{updateInfo.current_version} → v{updateInfo.latest_version}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setModalOpen(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            {t("update.release_notes")}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
          >
            {t("update.dismiss")}
          </button>
        </div>
      </div>

      <UpdateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        updateInfo={updateInfo}
      />
    </>
  );
}
