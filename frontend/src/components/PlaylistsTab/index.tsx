import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, ListTodo, Share2, ArrowLeft, Trash2, Pencil, Film,
  Sparkles, GripVertical, Calendar, StickyNote, LayoutGrid,
} from "lucide-react";
import type { Playlist, PlaylistItem } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { formatDate } from "../../utils/date";
import FadeContent from "../FadeContent";
import { EmptyState } from "../EmptyState";
import { Modal } from "../Modal";
import { CreateEditModal } from "./CreateEditModal";
import { AddItemModal } from "./AddItemModal";
import { ShareModal } from "./ShareModal";
import { CompletePlanModal } from "./CompletePlanModal";

/** Simple poster with fallback (no animation deps needed) */
function Poster({ src, title, className = "w-full h-full object-cover" }: { src?: string | null; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`} style={{ background: "var(--bg-input)" }}>
        <Film size={16} style={{ color: "var(--fg-dim)", opacity: 0.5 }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════
   Collage cover — up to 3 item posters fanned like a hand of cards.
   Portrait posters stay in their natural 2:3 shape, so nothing gets
   cropped into a mystery wallpaper. Falls back to single cover art.
   ══════════════════════════════════════════════════════════════════ */
function CollageCover({ posters, coverUrl, name, size = "md" }: {
  posters: string[];
  coverUrl: string | null;
  name: string;
  size?: "sm" | "md";
}) {
  const dims = size === "sm"
    ? { w: 22, h: 32, r: 14 }
    : { w: 44, h: 64, r: 26 };

  if (posters.length >= 2) {
    // Up to 3 visible posters; extras just strengthen the stack shadow.
    const visible = posters.slice(0, 3);
    // The fanned posters are absolutely positioned, so the strip itself
    // must reserve real layout width — otherwise the container collapses
    // to 0px and the posters spill over adjacent text (e.g. the detail
    // header title/description).
    const stripWidth = Math.ceil(dims.w + dims.r * 2 + 10);
    return (
      <div className="flex items-center justify-center" style={{ height: dims.h + 32 }}>
        <div className="relative" style={{ width: stripWidth }}>
          {visible.map((src, i) => {
            const offset = i - (visible.length - 1) / 2; // -1, 0, 1
            return (
              <div
                key={i}
                className="absolute rounded-md overflow-hidden border border-border-subtle"
                style={{
                  width: dims.w,
                  height: dims.h,
                  left: "50%",
                  top: "50%",
                  marginLeft: -dims.w / 2,
                  marginTop: -dims.h / 2,
                  transform: `translate(${offset * dims.r}px, 0) rotate(${offset * 5}deg)`,
                  zIndex: i === 1 || visible.length === 2 ? 2 : 1,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
                }}
              >
                <Poster src={src} title="" />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Single poster or legacy cover_url fallback
  const src = posters[0] ?? coverUrl;
  return (
    <div className="relative flex items-center justify-center py-3" style={{ height: dims.h + 26 }}>
      {src ? (
        <div
          className="rounded-md overflow-hidden border border-border-subtle"
          style={{ width: dims.w * 1.15, height: dims.h, boxShadow: "0 4px 12px rgba(0,0,0,0.45)" }}
        >
          <Poster src={src} title={name} />
        </div>
      ) : (
        <div
          className="rounded-md flex items-center justify-center border border-border-subtle"
          style={{ width: dims.w * 1.15, height: dims.h, background: "var(--bg-input)" }}
        >
          <ListTodo size={size === "sm" ? 14 : 20} style={{ color: "var(--fg-dim)", opacity: 0.5 }} />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Detail-view item row — 2:3 poster, drag handle, inline actions
   ══════════════════════════════════════════════════════════════════ */
function ItemCard({
  item,
  index,
  total,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMove,
  onRemove,
  onEditNote,
}: {
  item: PlaylistItem;
  index: number;
  total: number;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (item: PlaylistItem) => void;
  onEditNote: (item: PlaylistItem) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={(e) => { e.preventDefault(); onDragEnd(); }}
      className="group flex items-center gap-3 p-2 sm:p-2.5 rounded-xl border bg-card transition-all"
      style={{
        borderColor: isDragOver ? "var(--seed-primary)" : "var(--border-default)",
        boxShadow: isDragOver ? "0 0 0 1px var(--seed-primary)" : undefined,
        opacity: isDragging ? 0.35 : 1,
        cursor: "grab",
      }}
    >
      {/* Drag handle (desktop affordance; whole row is draggable) */}
      <span
        className="hidden sm:flex w-5 h-8 items-center justify-center text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors"
        title={t("playlists.drag_hint")}
      >
        <GripVertical size={13} />
      </span>

      {/* Rank */}
      <span className="w-6 text-center text-[11px] font-mono text-muted-foreground/70 tabular-nums shrink-0">
        {index + 1}
      </span>

      {/* Poster — real 2:3, no crop */}
      <div className="w-10 h-[60px] rounded-md overflow-hidden shrink-0 border border-border-subtle">
        <Poster src={item.poster_url} title={item.title} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={item.title}>{item.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {item.year != null && <span className="text-[10px] text-muted-foreground tabular-nums">{item.year}</span>}
          {item.media_type === "tv" && (
            <span className="text-[10px] px-1 py-0.5 rounded-full text-sky border border-sky/30 bg-sky/5 leading-none">TV</span>
          )}
          {item.genre && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground truncate max-w-[90px]">{item.genre}</span>
          )}
          {item.note && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground truncate max-w-[140px] italic">
              <StickyNote size={9} className="shrink-0" />
              “{item.note}”
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {/* Arrow fallbacks — most useful on touch where HTML5 DnD doesn't work */}
        <div className="flex flex-col sm:hidden">
          <button
            className="w-6 h-5 rounded flex items-center justify-center text-muted-foreground/60 disabled:opacity-30"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            title={t("common.up", "Up")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 6.5 5 3.5 8 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            className="w-6 h-5 rounded flex items-center justify-center text-muted-foreground/60 disabled:opacity-30"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            title={t("common.down", "Down")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => onEditNote(item)}
          title={t("playlists.edit_note")}
        >
          <StickyNote size={12} />
        </button>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => onRemove(item)}
          title={t("playlists.remove_item")}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Delete confirmation — shared by list & detail views
   ══════════════════════════════════════════════════════════════════ */
function DeleteConfirmModal({ target, onCancel, onConfirm }: {
  target: Playlist | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={target !== null}
      onClose={onCancel}
      title={t("playlists.delete")}
      description={t("playlists.delete_confirm", { name: target?.name ?? "" })}
    >
      <p className="text-xs text-muted-foreground/80 -mt-2">{t("playlists.delete_confirm_desc")}</p>
      <div className="flex items-center justify-end gap-2 mt-5">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t("common.cancel")}</button>
        <button
          className="btn btn-sm gap-1.5"
          style={{ background: "var(--destructive)", color: "white" }}
          onClick={onConfirm}
        >
          <Trash2 size={13} />
          {t("common.delete")}
        </button>
      </div>
    </Modal>
  );
}

export function PlaylistsTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Playlist | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Playlist | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Playlist | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);
  const [noteTarget, setNoteTarget] = useState<PlaylistItem | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // Drag & drop state (detail view)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listPlaylists();
      setPlaylists(data.playlists);
    } catch (err) {
      showToast(t("playlists.load_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    loadPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const data = await api.getPlaylist(id);
      setDetail(data);
    } catch (err) {
      showToast(t("playlists.load_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setDetailLoading(false);
    }
  }, [showToast, t]);

  const closeDetail = useCallback(() => {
    setDetail(null);
    loadPlaylists();
  }, [loadPlaylists]);

  // ── Delete playlist ──
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.deletePlaylist(target.id);
      showToast(t("playlists.deleted"), "success");
      if (detail?.id === target.id) setDetail(null);
      loadPlaylists();
    } catch (err) {
      showToast(t("playlists.save_failed", { message: getErrMsg(err) }), "error");
    }
  }, [deleteTarget, detail, loadPlaylists, showToast, t]);

  // ── Item operations (detail view) ──
  const persistOrder = useCallback(async (items: PlaylistItem[]) => {
    if (!detail) return;
    try {
      await api.reorderPlaylistItems(detail.id, items.map((i) => i.id));
    } catch (err) {
      showToast(t("playlists.reorder_failed", { message: getErrMsg(err) }), "error");
      loadPlaylists();
    }
  }, [detail, loadPlaylists, showToast, t]);

  const moveItem = useCallback(async (index: number, dir: -1 | 1) => {
    if (!detail) return;
    const items = [...detail.items!];
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setDetail({ ...detail, items });
    persistOrder(items);
  }, [detail, persistOrder]);

  const removeItem = useCallback(async (item: PlaylistItem) => {
    if (!detail) return;
    try {
      await api.deletePlaylistItem(detail.id, item.id);
      showToast(t("playlists.removed", { title: item.title }), "success");
      const updated = { ...detail, items: detail.items!.filter((i) => i.id !== item.id) };
      setDetail(updated);
      loadPlaylists();
    } catch (err) {
      showToast(t("playlists.save_failed", { message: getErrMsg(err) }), "error");
    }
  }, [detail, loadPlaylists, showToast, t]);

  // ── Note editing (inline modal, replaces window.prompt) ──
  const openNoteEditor = useCallback((item: PlaylistItem) => {
    setNoteTarget(item);
    setNoteDraft(item.note ?? "");
  }, []);

  const saveNote = useCallback(async () => {
    if (!detail || !noteTarget) return;
    const note = noteDraft.trim() || null;
    try {
      const updated = await api.updatePlaylistItem(detail.id, noteTarget.id, { note });
      setDetail({ ...detail, items: detail.items!.map((i) => (i.id === noteTarget.id ? updated : i)) });
      showToast(t("playlists.updated"), "success");
      setNoteTarget(null);
    } catch (err) {
      showToast(t("playlists.update_failed", { message: getErrMsg(err) }), "error");
    }
  }, [detail, noteTarget, noteDraft, showToast, t]);

  // ── Copy share link helper ──
  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("share.copied"), "success");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast(t("share.copied"), "success");
      } catch {
        showToast(t("share.copy_failed", { message: "" }), "error");
      }
    }
  }, [showToast, t]);

  // ════════════════════════════════════════════════════════════
  // Detail view
  // ════════════════════════════════════════════════════════════
  const detailCoverPosters = useMemo(
    () => (detail?.items ?? []).map((i) => i.poster_url).filter((u): u is string => !!u).slice(0, 3),
    [detail],
  );

  if (detail) {
    const items = detail.items ?? [];
    return (
      <div className="space-y-5">
        {/* ── Cinematic hero header ── */}
        <FadeContent className="relative overflow-hidden rounded-2xl border border-border" >
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={detailCoverPosters[0] ? { backgroundImage: `url(${detailCoverPosters[0]})` } : undefined}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to right, var(--seed-bg) 20%, color-mix(in srgb, var(--seed-bg) 55%, transparent) 70%, color-mix(in srgb, var(--seed-bg) 25%, transparent))" }}
          />
          <div className="relative p-4 sm:p-6">
            <button
              onClick={closeDetail}
              className="btn btn-ghost btn-sm shrink-0 -ml-2 mb-3"
            >
              <ArrowLeft size={14} />
              {t("playlists.back")}
            </button>
            <div className="flex items-end gap-4">
              {/* Collage / cover */}
              <div className="shrink-0 hidden sm:block">
                <CollageCover posters={detailCoverPosters} coverUrl={detail.cover_url} name={detail.name} size="md" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-2xl font-semibold truncate">{detail.name}</h2>
                {detail.description && (
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">{detail.description}</p>
                )}
                <div className="flex items-center gap-2.5 flex-wrap mt-2.5 text-[11px] text-muted-foreground">
                  <span className="badge font-mono text-xs">{t("playlists.item_count", { count: items.length })}</span>
                  {detail.created_at && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={11} />
                      {t("playlists.created_at", { date: formatDate(detail.created_at) })}
                    </span>
                  )}
                  {detail.share_token && (
                    <button
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={() => copyText(`${window.location.origin}/share/${detail.share_token}`)}
                      title={t("share.link")}
                    >
                      <Share2 size={11} />
                      {t("playlists.shared_badge")}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-1.5 flex-wrap mt-4 pt-3 border-t border-border-subtle">
              <button className="btn btn-primary btn-sm gap-1.5" onClick={() => setAddItemOpen(true)}>
                <Plus size={13} />
                {t("playlists.add_items")}
              </button>
              <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => setCompleteOpen(true)}>
                <Sparkles size={13} />
                {t("playlists.ai_complete")}
              </button>
              <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => setShareTarget(detail)}>
                <Share2 size={13} />
                {t("playlists.share")}
              </button>
              <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => setEditTarget(detail)}>
                <Pencil size={13} />
                {t("playlists.rename")}
              </button>
              <button
                className="btn btn-ghost btn-sm gap-1.5 ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteTarget(detail)}
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">{t("common.delete")}</span>
              </button>
            </div>
          </div>
        </FadeContent>

        {/* ── Items list ── */}
        {detailLoading ? (
          <FadeContent className="section-card">
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          </FadeContent>
        ) : items.length === 0 ? (
          <FadeContent className="section-card">
            <EmptyState
              icon={<LayoutGrid className="w-10 h-10" />}
              noDataKey="playlists.empty_playlist"
              noDataSubtextKey="playlists.empty_playlist_hint"
              noDataActions={
                <button className="btn btn-ghost btn-sm" onClick={() => setAddItemOpen(true)}>
                  <Plus size={14} />
                  {t("playlists.add_items")}
                </button>
              }
            />
          </FadeContent>
        ) : (
          <FadeContent className="section-card">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[11px] text-muted-foreground">{t("playlists.sort_hint")}</p>
              {(dragIdx !== null || overIdx !== null) && (
                <span className="ml-auto text-[11px] text-primary">{t("playlists.drag_hint")}</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map((item, idx) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  index={idx}
                  total={items.length}
                  isDragging={dragIdx === idx}
                  isDragOver={overIdx === idx && dragIdx !== idx && dragIdx !== null}
                  onDragStart={(i) => { setDragIdx(i); }}
                  onDragOver={(e, i) => { e.preventDefault(); setOverIdx(i); }}
                  onDragEnd={() => {
                    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
                      const reordered = [...items];
                      const [moved] = reordered.splice(dragIdx, 1);
                      reordered.splice(overIdx, 0, moved);
                      setDetail({ ...detail, items: reordered });
                      persistOrder(reordered);
                    }
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  onMove={moveItem}
                  onRemove={removeItem}
                  onEditNote={openNoteEditor}
                />
              ))}
            </div>
          </FadeContent>
        )}

        <CreateEditModal
          open={editTarget !== null}
          onClose={() => setEditTarget(null)}
          target={editTarget}
          onSaved={() => {
            if (editTarget) openDetail(editTarget.id);
            setEditTarget(null);
          }}
        />
        <AddItemModal
          open={addItemOpen}
          onClose={() => setAddItemOpen(false)}
          playlist={detail}
          onAdded={() => openDetail(detail.id)}
        />
        <ShareModal
          open={shareTarget !== null}
          onClose={() => setShareTarget(null)}
          playlist={shareTarget}
          onChanged={() => openDetail(detail.id)}
        />
        <CompletePlanModal
          open={completeOpen}
          onClose={() => setCompleteOpen(false)}
          playlist={detail}
          onAdded={() => openDetail(detail.id)}
        />

        {/* Note editor */}
        <Modal
          open={noteTarget !== null}
          onClose={() => setNoteTarget(null)}
          title={t("playlists.edit_note")}
          description={noteTarget?.title}
        >
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder={t("playlists.note_placeholder")}
            rows={3}
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-transparent text-foreground text-sm leading-relaxed resize-y min-h-[64px] transition-colors focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-end gap-2 mt-4">
            <button className="btn btn-ghost btn-sm" onClick={() => setNoteTarget(null)}>{t("common.cancel")}</button>
            <button className="btn btn-primary btn-sm" onClick={saveNote}>{t("common.save")}</button>
          </div>
        </Modal>

        {/* Delete confirm */}
        <DeleteConfirmModal
          target={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // List view
  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      <div className="section-card">
        <div className="section-header flex-wrap gap-2 sm:flex-nowrap">
          <h2 className="section-title flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-primary" />
            {t("playlists.title")}
          </h2>
          <div className="flex items-center gap-1.5 ml-auto">
            <button className="btn btn-primary btn-sm shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              {t("playlists.create")}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("playlists.subtitle")}</p>
      </div>

      {loading ? (
        <div className="section-card">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="skeleton h-[88px] w-full mb-3" />
                <div className="skeleton h-3.5 w-3/5 mb-1.5" />
                <div className="skeleton h-2.5 w-2/5" />
              </div>
            ))}
          </div>
        </div>
      ) : playlists.length === 0 ? (
        <div className="section-card">
          <EmptyState
            icon={<ListTodo className="w-10 h-10" />}
            noDataKey="playlists.no_playlists"
            noDataSubtextKey="playlists.no_playlists_hint"
            noDataActions={
              <button className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                {t("playlists.create")}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {playlists.map((p) => (
            <PlaylistCard
              key={p.id}
              playlist={p}
              onOpen={() => openDetail(p.id)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <CreateEditModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); loadPlaylists(); }} />

      {/* Delete confirm (list view) */}
      <DeleteConfirmModal
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Playlist card — collage cover + name + description + meta footer.
   Actions live in a hover overlay so the card itself stays clean.
   ══════════════════════════════════════════════════════════════════ */
function PlaylistCard({ playlist, onOpen, onDelete }: {
  playlist: Playlist;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const posters = useMemo(() => {
    if (playlist.cover_posters && playlist.cover_posters.length > 0) return playlist.cover_posters;
    if (playlist.cover_url) return [playlist.cover_url];
    return [];
  }, [playlist.cover_posters, playlist.cover_url]);

  return (
    <div
      className="group relative rounded-xl border border-border bg-card overflow-hidden transition-all card-lift cursor-pointer flex flex-col"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      {/* Hover actions — top right */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity">
        <button
          className="w-6 h-6 rounded-md flex items-center justify-center bg-black/60 backdrop-blur-sm text-white/70 hover:text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={t("common.delete")}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Share badge — top left */}
      {playlist.share_token && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur text-[9px] text-white/90 pointer-events-none">
          <Share2 size={8} />
          {t("playlists.share")}
        </div>
      )}

      {/* Collage */}
      <div className="border-b border-border-subtle" style={{ background: "linear-gradient(160deg, var(--accent-glow), transparent 55%)" }}>
        <CollageCover posters={posters} coverUrl={playlist.cover_url} name={playlist.name} size="md" />
      </div>

      {/* Footer info */}
      <div className="p-2.5 sm:p-3 flex-1 flex flex-col min-w-0">
        <p className="text-sm font-semibold truncate" title={playlist.name}>{playlist.name}</p>
        {playlist.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1" title={playlist.description}>{playlist.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded-full font-mono" style={{ background: "var(--primary-10)", color: "var(--seed-accent)" }}>
            {t("playlists.item_count", { count: playlist.item_count ?? 0 })}
          </span>
          {playlist.created_at && (
            <span className="truncate">{t("playlists.created_at", { date: formatDate(playlist.created_at) })}</span>
          )}
        </div>
      </div>
    </div>
  );
}
