import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { Modal } from "../Modal";
import { Loader2 } from "lucide-react";
import type { Playlist } from "../../types";

interface CreateEditModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, the modal edits this playlist; otherwise it creates a new one */
  target?: Playlist | null;
  onSaved?: () => void;
}

export function CreateEditModal({ open, onClose, target, onSaved }: CreateEditModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset fields whenever the modal opens / target changes
  useEffect(() => {
    if (open) {
      setName(target?.name ?? "");
      setDescription(target?.description ?? "");
    }
  }, [open, target]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showToast(t("playlists.save_failed", { message: "名称不能为空" }), "error");
      return;
    }
    setSaving(true);
    try {
      if (target) {
        await api.updatePlaylist(target.id, { name: name.trim(), description: description.trim() || null });
      } else {
        await api.createPlaylist({ name: name.trim(), description: description.trim() || null });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      showToast(t("playlists.save_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setSaving(false);
    }
  }, [name, description, target, onSaved, onClose, showToast, t]);

  const handleClose = useCallback(() => {
    setName("");
    setDescription("");
    onClose();
  }, [onClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={target ? t("playlists.edit_title") : t("playlists.create_title")}
    >
      <div className="space-y-3.5">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">{t("playlists.name")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder={t("playlists.name_placeholder")}
            autoFocus
            className="input-field w-full h-10 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">{t("playlists.description")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("playlists.description_placeholder")}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground text-sm leading-relaxed resize-y min-h-[64px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button className="btn btn-ghost btn-sm" onClick={handleClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <><Loader2 size={13} className="animate-spin" />{t("playlists.creating")}</>
            ) : (
              <>{t(target ? "common.save" : "playlists.create_btn")}</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
