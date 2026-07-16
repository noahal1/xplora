import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../../api";
import { useToast } from "../../../context/ToastContext";
import { useEnrich } from "../../../context/EnrichContext";
import { getErrMsg } from "../../../lib/utils";
import { Modal } from "../../Modal";
import { GenreInput } from "../../GenreInput";
import { Separator } from "../../ui/separator";

interface WishlistAddModalProps {
  open: boolean;
  onClose: () => void;
  onAddSuccess: () => void;
}

export function WishlistAddModal({ open, onClose, onAddSuccess }: WishlistAddModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();

  const [newTitle, setNewTitle] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [jsonText, setJsonText] = useState("");

  const addMovie = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) { showToast(t("wishlist.enter_title"), "error"); return; }
    const year = newYear.trim() ? parseInt(newYear.trim()) : null;
    try {
      await api.addToWishlist({ title, year, genre: newGenre || null });
      setNewTitle(""); setNewYear(""); setNewGenre("");
      showToast(t("wishlist.added_to_wishlist", { title }), "success");
      startPolling();
      onAddSuccess();
      onClose();
    } catch (err: unknown) { showToast(t("wishlist.add_failed", { message: getErrMsg(err) }), "error"); }
  }, [newTitle, newYear, newGenre, showToast, startPolling, onAddSuccess, onClose, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addMovie(); } }, [addMovie]);

  const handleImportJSON = useCallback(async () => {
    if (!jsonText.trim()) { showToast(t("wishlist.json_empty"), "error"); return; }
    try {
      const raw = JSON.parse(jsonText);
      const list = Array.isArray(raw) ? raw : raw.movies || raw.items || [];
      if (!Array.isArray(list) || list.length === 0) { showToast(t("wishlist.json_invalid"), "error"); return; }
      const parsedItems = (list as { title?: string; name?: string; year?: number; genre?: string }[])
        .map((item) => ({ title: (item.title || item.name || "").trim(), year: item.year ?? null, genre: item.genre ?? null }))
        .filter((m) => m.title);
      if (parsedItems.length === 0) { showToast(t("wishlist.json_invalid"), "error"); return; }
      // Fetch ALL existing titles for dedup (not just current page)
      const existingTitles = await api.listMediaTitles();
      const existingSet = new Set(existingTitles.map((t: string) => t.toLowerCase()));
      const newItems = parsedItems.filter((m: any) => !existingSet.has(m.title.toLowerCase()));
      if (newItems.length === 0) { showToast(t("wishlist.json_all_exist"), "info"); return; }
      await api.importWishlist(newItems);
      showToast(t("wishlist.json_imported", { count: newItems.length }), "success");
      startPolling();
      onAddSuccess();
      setJsonText("");
      onClose();
    } catch (err: unknown) { showToast(t("wishlist.json_parse_failed", { message: getErrMsg(err) }), "error"); }
  }, [jsonText, showToast, onAddSuccess, onClose, t, startPolling]);

  const handleClose = useCallback(() => {
    setNewTitle(""); setNewYear(""); setNewGenre(""); setJsonText("");
    onClose();
  }, [onClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("wishlist.manual_add_title")}
    >
      <div className="space-y-4">
        <div className="space-y-2.5">
          <input type="text" placeholder={t("wishlist.title_placeholder")} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={handleKeyDown} className="input-field w-full h-10 text-sm" />
          <div className="flex items-center gap-2">
            <input type="number" placeholder={t("wishlist.year_placeholder")} value={newYear} onChange={(e) => setNewYear(e.target.value)} onKeyDown={handleKeyDown}
              className="input-field w-[80px] h-10 text-sm no-spinner shrink-0" />
            <div className="flex-1 min-w-0"><GenreInput value={newGenre} onChange={setNewGenre} placeholder={t("wishlist.genre_placeholder")} onKeyDown={handleKeyDown} /></div>
            <button className="btn btn-primary h-10 shrink-0" onClick={addMovie}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {t("wishlist.add")}
            </button>
          </div>
        </div>
        <div className="relative my-3">
          <div className="absolute inset-0 flex items-center"><Separator /></div>
          <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">{t("wishlist.batch_import")}</span></div>
        </div>
        <div className="space-y-3">
          <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder={t("wishlist.json_placeholder")}
            rows={3} className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground font-mono text-xs leading-relaxed resize-y min-h-[60px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground" />
          <button className="btn btn-ghost btn-sm w-full" onClick={handleImportJSON}>{t("wishlist.import_to_wishlist")}</button>
        </div>
      </div>
    </Modal>
  );
}
