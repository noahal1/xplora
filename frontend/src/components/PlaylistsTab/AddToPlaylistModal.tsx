import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Loader2, ListTodo, Sparkles, Wand2, Clapperboard } from "lucide-react";
import type { Playlist } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { Modal } from "../Modal";
import { VirtualList } from "../VirtualList";

/** A media item that can be added to playlists (from library or recommendation) */
export interface PlaylistTargetItem {
  media_id?: number | null;
  title: string;
  year?: number | null;
  genre?: string | null;
  media_type?: string;
  poster_url?: string | null;
  overview?: string | null;
  tmdb_id?: string | null;
}

interface AddToPlaylistModalProps {
  open: boolean;
  onClose: () => void;
  item: PlaylistTargetItem | null;
  onAdded?: (playlistName: string) => void;
}

export function AddToPlaylistModal({ open, onClose, item, onAdded }: AddToPlaylistModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCreating, setNewCreating] = useState(false);
  const [aiNaming, setAiNaming] = useState(false);
  const [aiNames, setAiNames] = useState<string[]>([]);
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ playlist_id: number; name: string; reason: string; confidence: number }>>([]);
  const [aiPeople, setAiPeople] = useState<Array<{ name: string; role: string; playlist_name: string }>>([]);

  // Load playlists when the modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPlaylists([]);
    api.listPlaylists()
      .then((data) => { if (!cancelled) setPlaylists(data.playlists); })
      .catch((err) => { if (!cancelled) showToast(t("playlists.load_failed", { message: getErrMsg(err) }), "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, showToast, t]);

  const handleAdd = useCallback(async (playlistId: number, name: string) => {
    if (!item || adding) return;
    setAdding(true);
    try {
      const res = await api.addPlaylistItem(playlistId, {
        media_id: item.media_id ?? null,
        title: item.title,
        year: item.year ?? null,
        genre: item.genre ?? null,
        media_type: item.media_type ?? "movie",
        poster_url: item.poster_url ?? null,
        tmdb_id: item.tmdb_id ?? null,
      });
      if ((res as unknown as { duplicate?: boolean }).duplicate) {
        // Server-side dedup already handled it — tell the user
        showToast(t("playlists.already_in_playlist"), "info");
      } else {
        showToast(t("playlists.add_to_playlist_success", { playlist: name }), "success");
        onAdded?.(name);
        onClose();
      }
    } catch (err) {
      showToast(t("playlists.add_to_playlist_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAdding(false);
    }
  }, [item, adding, onAdded, onClose, showToast, t]);

  /** Create a playlist with the given name and add the item to it */
  const createAndAdd = useCallback(async (name: string) => {
    if (!item || adding) return;
    setAdding(true);
    try {
      const created = await api.createPlaylist({ name });
      setPlaylists((prev) => [created, ...prev]);
      // Add the item to the freshly created playlist
      await api.addPlaylistItem(created.id, {
        media_id: item.media_id ?? null,
        title: item.title,
        year: item.year ?? null,
        genre: item.genre ?? null,
        media_type: item.media_type ?? "movie",
        poster_url: item.poster_url ?? null,
        tmdb_id: item.tmdb_id ?? null,
      });
      showToast(t("playlists.add_to_playlist_success", { playlist: created.name }), "success");
      onAdded?.(created.name);
      onClose();
    } catch (err) {
      showToast(t("playlists.add_to_playlist_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAdding(false);
    }
  }, [item, adding, onAdded, onClose, showToast, t]);

  const handleCreateAndAdd = useCallback(async () => {
    if (!item || !newName.trim() || newCreating) return;
    setNewCreating(true);
    try {
      await createAndAdd(newName.trim());
    } finally {
      setNewName("");
      setNewCreating(false);
    }
  }, [item, newName, newCreating, createAndAdd]);

  /** Ask AI to invent 3 playlist name candidates based on this movie — and, in
   * the same call, detect a famous director/actor themed playlist (if any). */
  const handleAIName = useCallback(async () => {
    if (!item || aiNaming) return;
    setAiNaming(true);
    try {
      const res = await api.generatePlaylistAIName({
        title: item.title,
        year: item.year ?? null,
        genre: item.genre ?? null,
        overview: item.overview ?? null,
        media_type: item.media_type ?? "movie",
        lang: i18n.language?.startsWith("en") ? "en" : "zh",
      });
      // People suggestions come back in the same call — set them even if the
      // model returned no names (so they aren't dropped in that edge case).
      setAiPeople(res.people || []);
      if (res.names && res.names.length > 0) {
        setAiNames(res.names);
        showToast(t("playlists.ai_name_generated"), "success");
      } else {
        showToast(t("playlists.ai_name_failed", { message: "" }), "error");
      }
    } catch (err) {
      showToast(t("playlists.ai_name_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAiNaming(false);
    }
  }, [item, aiNaming, i18n.language, showToast, t]);

  /** Pick a candidate name → fill the input */
  const pickAIName = useCallback((name: string) => {
    setNewName(name);
    setAiNames([]);
  }, []);

  /** Ask AI to suggest which existing playlist(s) this movie fits */
  const handleAICategorize = useCallback(async () => {
    if (!item || aiCategorizing) return;
    setAiCategorizing(true);
    setAiSuggestions([]);
    try {
      const res = await api.aiCategorizePlaylist({
        title: item.title,
        year: item.year ?? null,
        genre: item.genre ?? null,
        overview: item.overview ?? null,
        media_type: item.media_type ?? "movie",
        lang: i18n.language?.startsWith("en") ? "en" : "zh",
      });
      if (res.reason === "no_playlists") {
        showToast(t("playlists.ai_categorize_no_playlist"), "info");
      } else if (res.suggestions && res.suggestions.length > 0) {
        setAiSuggestions(res.suggestions);
      } else {
        showToast(t("playlists.ai_categorize_none"), "info");
      }
    } catch (err) {
      showToast(t("playlists.ai_categorize_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAiCategorizing(false);
    }
  }, [item, aiCategorizing, i18n.language, showToast, t]);

  /** Create a people-themed playlist (e.g. "诺兰导演作品") and add the item */
  const handleCreatePeoplePlaylist = useCallback((name: string) => {
    createAndAdd(name);
  }, [createAndAdd]);

  const handleClose = useCallback(() => {
    setNewName("");
    setAiNames([]);
    setAiSuggestions([]);
    setAiPeople([]);
    onClose();
  }, [onClose]);

  return (
    <Modal open={open} onClose={handleClose} title={t("playlists.add_to_playlist")}>
      <div className="space-y-3">
        {/* Target item preview */}
        {item && (
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-muted/30">
            <div className="w-9 h-[52px] rounded overflow-hidden shrink-0 border border-border-subtle">
              {item.poster_url ? (
                <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><ListTodo size={13} className="text-muted-foreground/40" /></div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {item.year != null ? `${item.year} · ` : ""}
                {item.media_type === "tv" ? "TV" : "Movie"}
              </p>
            </div>
          </div>
        )}

        {/* AI smart categorize — suggest which playlist fits this movie */}
        {item && (
          <div className="space-y-2">
            <button
              onClick={handleAICategorize}
              disabled={aiCategorizing || !item || playlists.length === 0}
              title={playlists.length === 0 ? t("playlists.ai_categorize_no_playlist") : undefined}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-primary/25 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {aiCategorizing ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {aiCategorizing ? t("playlists.ai_categorizing") : t("playlists.ai_categorize")}
            </button>
            {aiSuggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground">{t("playlists.ai_categorize_suggest")}</p>
                {aiSuggestions.map((s) => (
                  <button
                    key={s.playlist_id}
                    disabled={adding}
                    onClick={() => handleAdd(s.playlist_id, s.name)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border border-primary/25 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all text-left disabled:opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.name}
                        <span className="ml-1.5 text-[10px] text-primary tabular-nums">
                          {Math.round(s.confidence * 100)}%
                        </span>
                      </p>
                      {s.reason && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{s.reason}</p>}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-primary shrink-0"><Plus size={11} />{t("wishlist.add")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Playlist list */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">{t("playlists.no_playlists")}</p>
            <p className="text-xs mt-0.5">{t("playlists.no_playlists_hint")}</p>
          </div>
        ) : (
          <VirtualList
            items={playlists}
            rowHeight={60}
            keyFn={(p) => `pl-${p.id}`}
            renderRow={(p) => (
              <button
                disabled={adding}
                onClick={() => handleAdd(p.id, p.name)}
                className="w-full h-[calc(100%-4px)] mb-1 flex items-center gap-2.5 p-2 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/20 transition-all text-left disabled:opacity-60"
              >
                <div className="w-7 h-10 rounded overflow-hidden shrink-0 border border-border-subtle">
                  {p.cover_url ? (
                    <img src={p.cover_url} alt="" className="w-full h-full object-cover" loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ListTodo size={11} className="text-muted-foreground/40" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{t("playlists.item_count", { count: p.item_count ?? 0 })}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0"><Plus size={11} />{t("wishlist.add")}</span>
              </button>
            )}
          />
        )}

        {/* Create new playlist inline */}
        <div className="space-y-1.5 pt-1 border-t border-border">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndAdd(); }}
              placeholder={t("playlists.name_placeholder")}
              className="input-field w-full h-9 text-sm"
            />
            <button
              className="btn btn-primary btn-sm shrink-0 gap-1"
              onClick={handleCreateAndAdd}
              disabled={!newName.trim() || newCreating}
            >
              {newCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {t("playlists.create_btn")}
            </button>
          </div>
          <button
            onClick={handleAIName}
            disabled={aiNaming || !item}
            className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 hover:underline transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title={t("playlists.ai_name_hint")}
          >
            {aiNaming ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {aiNaming ? t("playlists.ai_generating") : t("playlists.ai_name")}
          </button>

          {/* AI candidate picker — name chips + famous director/actor playlist
              suggestions, both from the same combined AI call */}
          {aiNames.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">{t("playlists.ai_name_pick")}</p>
              <div className="flex flex-wrap gap-1.5">
                {aiNames.map((name, idx) => (
                  <button
                    key={`${name}-${idx}`}
                    onClick={() => pickAIName(name)}
                    className="px-2 py-1 rounded-md text-xs border border-primary/30 bg-primary/5 text-foreground hover:bg-primary/15 hover:border-primary/50 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {item && aiPeople.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] text-muted-foreground">{t("playlists.ai_people_suggest")}</p>
              {aiPeople.map((p) => (
                <button
                  key={`${p.name}-${p.role}`}
                  disabled={adding}
                  onClick={() => handleCreatePeoplePlaylist(p.playlist_name)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg border border-primary/25 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all text-left disabled:opacity-60"
                >
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary shrink-0">
                    <Clapperboard size={13} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.playlist_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {p.role === "director" ? t("playlists.ai_people_director") : t("playlists.ai_people_actor")} · {p.name}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-primary shrink-0"><Plus size={11} />{t("wishlist.add")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
