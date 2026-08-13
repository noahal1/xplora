import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, ListTodo, Share2, ArrowLeft, Trash2, Pencil, MoveUp, MoveDown, Film, LayoutGrid, Check, Sparkles } from "lucide-react";
import type { Playlist, PlaylistItem } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import FadeContent from "../FadeContent";
import { EmptyState } from "../EmptyState";
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

function ItemCard({
  item,
  index,
  total,
  onMove,
  onRemove,
  onEditNote,
}: {
  item: PlaylistItem;
  index: number;
  total: number;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (item: PlaylistItem) => void;
  onEditNote: (item: PlaylistItem) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/20 transition-all card-lift"
    >
      {/* Reorder handles */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none"
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
          title={t("common.up", "Up")}
        >
          <MoveUp size={11} />
        </button>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none"
          disabled={index === total - 1}
          onClick={() => onMove(index, 1)}
          title={t("common.down", "Down")}
        >
          <MoveDown size={11} />
        </button>
      </div>

      {/* Poster */}
      <div className="w-9 h-[52px] rounded overflow-hidden shrink-0 border border-border-subtle">
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
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px] italic">“{item.note}”</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => onEditNote(item)}
          title={t("common.edit", "Edit")}
        >
          <Pencil size={12} />
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
  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);
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
  const moveItem = useCallback(async (index: number, dir: -1 | 1) => {
    if (!detail) return;
    const items = [...detail.items!];
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    const orderedIds = items.map((i) => i.id);
    setDetail({ ...detail, items });
    try {
      await api.reorderPlaylistItems(detail.id, orderedIds);
    } catch (err) {
      showToast(t("playlists.reorder_failed", { message: getErrMsg(err) }), "error");
      loadPlaylists();
    }
  }, [detail, loadPlaylists, showToast, t]);

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

  const editNote = useCallback((item: PlaylistItem) => {
    if (!detail) return;
    const note = window.prompt(t("playlists.note_placeholder"), item.note ?? "");
    if (note === null) return;
    api.updatePlaylistItem(detail.id, item.id, { note: note.trim() || null })
      .then((updated) => {
        setDetail({ ...detail, items: detail.items!.map((i) => (i.id === item.id ? updated : i)) });
        loadPlaylists();
      })
      .catch((err) => showToast(t("playlists.update_failed", { message: getErrMsg(err) }), "error"));
  }, [detail, loadPlaylists, showToast, t]);

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
  if (detail) {
    const items = detail.items ?? [];
    return (
      <div className="space-y-5">
        <FadeContent className="section-card">
          <div className="section-header flex-wrap gap-2 sm:flex-nowrap">
            <button
              onClick={closeDetail}
              className="btn btn-ghost btn-sm shrink-0"
            >
              <ArrowLeft size={14} />
              {t("playlists.back")}
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-10 h-14 rounded overflow-hidden border border-border-subtle shrink-0 hidden sm:block">
                <Poster src={detail.cover_url} title={detail.name} />
              </div>
              <div className="min-w-0">
                <h2 className="section-title truncate">{detail.name}</h2>
                {detail.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setEditTarget(detail)} title={t("common.edit")}>
                <Pencil size={13} />
                <span className="hidden sm:inline">{t("playlists.rename")}</span>
              </button>
              <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setShareTarget(detail)} title={t("playlists.share")}>
                <Share2 size={13} />
                <span className="hidden sm:inline">{t("playlists.share")}</span>
              </button>
              <button
                className="btn btn-ghost btn-sm shrink-0 text-primary hover:text-primary"
                onClick={() => setCompleteOpen(true)}
                title={t("playlists.ai_complete")}
              >
                <Sparkles size={13} />
                <span className="hidden sm:inline">{t("playlists.ai_complete")}</span>
              </button>
              <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setAddItemOpen(true)}>
                <Plus size={13} />
                <span className="hidden sm:inline">{t("playlists.add_items")}</span>
              </button>
              <button
                className="btn btn-ghost btn-sm shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteTarget(detail)}
                title={t("playlists.delete")}
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">{t("playlists.delete")}</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="badge font-mono text-xs">{t("playlists.item_count", { count: items.length })}</span>
            {detail.share_token && (
              <button
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                onClick={() => copyText(`${window.location.origin}/share/${detail.share_token}`)}
              >
                <Check size={10} />
                {t("share.enabled")}
              </button>
            )}
          </div>
        </FadeContent>

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
            <p className="text-[11px] text-muted-foreground mb-2.5">{t("playlists.sort_hint")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {items.map((item, idx) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  index={idx}
                  total={items.length}
                  onMove={moveItem}
                  onRemove={removeItem}
                  onEditNote={editNote}
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

        {/* Delete confirm — reachable from detail view */}
        {deleteTarget && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 max-sm:bg-black/70 animate-fade-in">
            <FadeContent className="bg-popover border border-border rounded-xl shadow-lg w-full max-w-sm p-5">
              <h3 className="text-base font-semibold">{t("playlists.delete")}</h3>
              <p className="text-sm text-muted-foreground mt-2">{t("playlists.delete_confirm", { name: deleteTarget.name })}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{t("playlists.delete_confirm_desc")}</p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</button>
                <button className="btn btn-sm gap-1.5" style={{ background: "var(--destructive)", color: "white" }} onClick={confirmDelete}>
                  <Trash2 size={13} />
                  {t("common.delete")}
                </button>
              </div>
            </FadeContent>
          </div>
        )}
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
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
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
        <div className="section-card">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => openDetail(p.id)}
                className="group relative rounded-xl overflow-hidden border border-border hover:border-primary/40 hover:shadow-lg transition-all card-lift text-left"
              >
                {/* Cover — uses cover_url (first item's poster) as background */}
                <div className="aspect-[16/10] w-full overflow-hidden">
                  {p.cover_url ? (
                    <img
                      src={p.cover_url}
                      alt={p.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-input)" }}>
                      <ListTodo size={24} style={{ color: "var(--fg-dim)", opacity: 0.4 }} />
                    </div>
                  )}
                </div>
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <p className="text-sm font-[590] text-white truncate drop-shadow">{p.name}</p>
                  <p className="text-[10px] text-white/70 truncate mt-0.5">
                    {t("playlists.item_count", { count: p.item_count ?? 0 })}
                  </p>
                </div>
                {/* Share badge */}
                {p.share_token && (
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur text-[9px] text-white/90 pointer-events-none">
                    <Share2 size={8} />
                    {t("playlists.share")}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      <CreateEditModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); loadPlaylists(); }} />

      {/* Delete confirm (list view) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 max-sm:bg-black/70 animate-fade-in">
          <FadeContent className="bg-popover border border-border rounded-xl shadow-lg w-full max-w-sm p-5">
            <h3 className="text-base font-semibold">{t("playlists.delete")}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t("playlists.delete_confirm", { name: deleteTarget.name })}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t("playlists.delete_confirm_desc")}</p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</button>
              <button className="btn btn-sm gap-1.5" style={{ background: "var(--destructive)", color: "white" }} onClick={confirmDelete}>
                <Trash2 size={13} />
                {t("common.delete")}
              </button>
            </div>
          </FadeContent>
        </div>
      )}
    </div>
  );
}
