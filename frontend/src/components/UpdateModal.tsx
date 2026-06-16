import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface UpdateInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  release_notes: string | null;
  published_at: string | null;
  error: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function UpdateModal({ open, onClose, updateInfo }: Props) {
  const { t, i18n } = useTranslation();

  const formatDateLocalized = (dateStr: string | null): string => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(i18n.language === "zh-CN" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="🚀 Xplora">
      <div className="space-y-5">
        {/* Version comparison */}
        <div className="flex items-center gap-4 justify-center">
          {/* Current version */}
          <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl" style={{ background: "var(--bg-card)" }}>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {t("update.current")}
            </span>
            <span className="text-xl font-bold font-mono" style={{ color: "var(--fg-muted)" }}>
              v{updateInfo.current_version}
            </span>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center">
            {updateInfo.update_available ? (
              <>
                <span className="text-lg">→</span>
                <span className="text-[10px] text-amber-500 font-medium">NEW</span>
              </>
            ) : (
              <span className="text-lg text-green">✓</span>
            )}
          </div>

          {/* Latest version */}
          <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl" style={{ background: "var(--bg-card)" }}>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {t("update.latest")}
            </span>
            <span className={`text-xl font-bold font-mono ${updateInfo.update_available ? "text-amber-500" : "text-green"}`}>
              v{updateInfo.latest_version || "—"}
            </span>
          </div>
        </div>

        {/* Published date */}
        {updateInfo.published_at && (
          <p className="text-center text-[11px] text-muted-foreground">
            {t("update.published_at", { date: formatDateLocalized(updateInfo.published_at) })}
          </p>
        )}

        {/* Release notes */}
        {updateInfo.release_notes && (
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              {t("update.release_notes")}
            </h4>
            <div
              className="text-xs leading-relaxed whitespace-pre-wrap rounded-xl p-3 max-h-48 overflow-y-auto"
              style={{
                background: "var(--bg-card)",
                color: "var(--fg-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {updateInfo.release_notes}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {updateInfo.release_url ? (
            <a
              href={updateInfo.release_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: "var(--foreground)",
                color: "var(--background)",
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              {t("update.download")}
            </a>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
