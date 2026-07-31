import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Plus, Loader2, Film, Check } from "lucide-react";
import type { Playlist } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { Modal } from "../Modal";

interface CompletePlanModalProps {
  open: boolean;
  onClose: () => void;
  playlist: Playlist;
  onAdded: () => void;
}

interface Suggestion {
  title: string;
  year?: number | null;
  genre?: string | null;
  media_type?: string | null;
  reason: string;
  confidence: number;
  poster_url?: string | null;
  tmdb_id?: string | null;
}

/** Poster with fallback (matches the Post style used elsewhere in PlaylistsTab) */
function SuggestionPoster({ src, title }: { src?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-input)" }}>
        <Film size={13} style={{ color: "var(--fg-dim)", opacity: 0.5 }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function CompletePlanModal({ open, onClose, playlist, onAdded }: CompletePlanModalProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState("");
  const [addingKeys, setAddingKeys] = useState<Set<number>>(new Set());
  const [addedKeys, setAddedKeys] = useState<Set<number>>(new Set());

  // Generate the completion plan when the modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSuggestions([]);
    setError("");
    setAddedKeys(new Set());
    api.aiCompletePlaylist(playlist.id, {
      lang: i18n.language?.startsWith("en") ? "en" : "zh",
      count: 6,
    })
      .then((res) => {
        if (cancelled) return;
        setSuggestions(res.suggestions ?? []);
        if (!res.suggestions || res.suggestions.length === 0) {
          setError(t("playlists.ai_complete_none"));
        }
      })
      .catch((err) => { if (!cancelled) setError(getErrMsg(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, playlist.id, i18n.language, t]);

  const addSuggestion = useCallback(async (idx: number, s: Suggestion) => {
    if (addingKeys.has(idx) || addedKeys.has(idx)) return;
    setAddingKeys((prev) => new Set(prev).add(idx));
    try {
      await api.addPlaylistItem(playlist.id, {
        title: s.title,
        year: s.year ?? null,
        genre: s.genre ?? null,
        media_type: s.media_type ?? "movie",
        poster_url: s.poster_url ?? null,
        tmdb_id: s.tmdb_id ?? null,
      });
      setAddedKeys((prev) => new Set(prev).add(idx));
      showToast(t("playlists.add_success", { title: s.title, playlist: playlist.name }), "success");
      onAdded();
    } catch (err) {
      showToast(t("playlists.add_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAddingKeys((prev) => { const next = new Set(prev); next.delete(idx); return next; });
    }
  }, [addingKeys, addedKeys, playlist, onAdded, showToast, t]);

  const handleClose = useCallback(() => {
    setSuggestions([]);
    setError("");
    onClose();
  }, [onClose]);

  return (
    <Modal open={open} onClose={handleClose} title={t("playlists.ai_complete")}>
      <div className="space-y-3">
        {/* Header hint */}
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl border border-border bg-muted/30">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}
          >
            <Sparkles size={14} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{t("playlists.ai_complete_desc", { name: playlist.name })}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("playlists.ai_complete_hint")}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
              <p className="text-xs text-muted-foreground">{t("playlists.ai_completing")}</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">{error}</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <button className="btn btn-ghost btn-sm" onClick={handleClose}>
                {t("common.close")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
            {suggestions.map((s, idx) => {
              const added = addedKeys.has(idx);
              const adding = addingKeys.has(idx);
              return (
                <div
                  key={`${s.title}-${idx}`}
                  className="flex items-center gap-2.5 p-2 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/20 transition-all"
                >
                  <div className="w-9 h-[52px] rounded overflow-hidden shrink-0 border border-border-subtle">
                    <SuggestionPoster src={s.poster_url} title={s.title} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={s.title}>{s.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {s.year != null && <span className="text-[10px] text-muted-foreground tabular-nums">{s.year}</span>}
                      {s.media_type === "tv" && (
                        <span className="text-[10px] px-1 py-0.5 rounded-full text-sky border border-sky/30 bg-sky/5 leading-none">TV</span>
                      )}
                      <span className="text-[10px] text-primary tabular-nums">{Math.round(s.confidence * 100)}%</span>
                    </div>
                    {s.reason && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={s.reason}>{s.reason}</p>
                    )}
                  </div>
                  <button
                    className={`btn btn-xs shrink-0 gap-1 ${added ? "btn-ghost" : ""}`}
                    disabled={adding || added}
                    onClick={() => addSuggestion(idx, s)}
                  >
                    {adding ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : added ? (
                      <>
                        <Check size={12} />
                        {t("playlists.added")}
                      </>
                    ) : (
                      <>
                        <Plus size={12} />
                        {t("wishlist.add")}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
