import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Share2, Copy, Check, Loader2, Link2Off } from "lucide-react";
import type { Playlist } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { Modal } from "../Modal";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  playlist: Playlist | null;
  onChanged: () => void;
}

export function ShareModal({ open, onClose, playlist, onChanged }: ShareModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = playlist?.share_token
    ? `${window.location.origin}/share/${playlist.share_token}`
    : "";

  const handleEnable = useCallback(async () => {
    if (!playlist) return;
    setEnabling(true);
    try {
      await api.sharePlaylist(playlist.id);
      showToast(t("share.enabled"), "success");
      onChanged();
    } catch (err) {
      showToast(t("share.failed", { message: getErrMsg(err) }), "error");
    } finally {
      setEnabling(false);
    }
  }, [playlist, onChanged, showToast, t]);

  const handleDisable = useCallback(async () => {
    if (!playlist) return;
    if (!window.confirm(t("share.disable_confirm"))) return;
    setDisabling(true);
    try {
      await api.unsharePlaylist(playlist.id);
      showToast(t("share.disabled"), "success");
      onChanged();
    } catch (err) {
      showToast(t("share.failed", { message: getErrMsg(err) }), "error");
    } finally {
      setDisabling(false);
    }
  }, [playlist, onChanged, showToast, t]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        showToast(t("share.copy_failed", { message: getErrMsg(err) }), "error");
      }
    }
  }, [shareUrl, showToast, t]);

  return (
    <Modal open={open} onClose={onClose} title={t("share.title")}>
      <div className="space-y-4">
        {/* Share icon header */}
        <div className="flex flex-col items-center py-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}
          >
            <Share2 size={22} className="text-primary" />
          </div>
          <p className="text-sm text-center text-muted-foreground px-2">{t("share.desc_off")}</p>
        </div>

        {!playlist?.share_token ? (
          /* Not shared yet */
          <button
            className="btn btn-primary w-full gap-2"
            onClick={handleEnable}
            disabled={enabling}
          >
            {enabling ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
            {enabling ? t("share.enabling") : t("share.enable")}
          </button>
        ) : (
          /* Shared — show link + copy + disable */
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground mb-1">{t("share.link")}</p>
                <div
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground font-mono truncate"
                  title={shareUrl}
                >
                  {shareUrl}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`btn flex-1 gap-1.5 ${copied ? "btn-primary" : "btn-ghost"}`}
                onClick={handleCopy}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t("share.copied") : t("share.copy")}
              </button>
              <button
                className="btn btn-ghost gap-1.5"
                onClick={handleDisable}
                disabled={disabling}
                title={t("share.disable")}
              >
                {disabling ? <Loader2 size={14} className="animate-spin" /> : <Link2Off size={14} />}
                {t("share.disable")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
