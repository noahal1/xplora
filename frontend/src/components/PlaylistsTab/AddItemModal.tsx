import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Search, Loader2, Plus, Film, Library, Globe } from "lucide-react";
import type { Playlist, MediaSearchResult } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { Modal } from "../Modal";
import { SearchResultCard } from "../shared/SearchResultCard";

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
  playlist: Playlist;
  onAdded: () => void;
}

interface LibraryEntry {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  media_type: string;
  poster_url: string | null;
  tmdb_id: string | null;
}

export function AddItemModal({ open, onClose, playlist, onAdded }: AddItemModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [tab, setTab] = useState<"library" | "search">("library");
  const [libraryItems, setLibraryItems] = useState<LibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // External search state
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());

  const existingTitles = useMemo(
    () => new Set((playlist.items ?? []).map((i) => i.title.toLowerCase())),
    [playlist.items],
  );

  // Load library items when the modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLibraryLoading(true);
    api.listMedia({ page: 0, page_size: 2000 })
      .then((data) => {
        if (cancelled) return;
        setLibraryItems(data.media.map((m) => ({
          id: m.id,
          title: m.title,
          year: m.year,
          genre: m.genre,
          media_type: m.media_type,
          poster_url: m.poster_url,
          tmdb_id: m.tmdb_id,
        })));
      })
      .catch((err) => { if (!cancelled) showToast(getErrMsg(err), "error"); })
      .finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [open, showToast]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) { setSearchResults([]); setSearchError(""); setSearchDone(false); return; }
    setSearchLoading(true);
    setSearchError("");
    try {
      const data = await api.searchMedia(query.trim(), "auto");
      setSearchResults(data.results);
      setSearchDone(true);
    } catch (err) {
      setSearchError(getErrMsg(err));
      setSearchResults([]);
      setSearchDone(true);
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  const addItem = useCallback(async (payload: {
    media_id?: number;
    title: string;
    year?: number | null;
    genre?: string | null;
    media_type?: string | null;
    poster_url?: string | null;
    tmdb_id?: string | null;
  }) => {
    const key = payload.media_id ? `lib:${payload.media_id}` : `ext:${payload.title}|${payload.year ?? ""}`;
    if (addingKeys.has(key)) return;
    if (existingTitles.has(payload.title.toLowerCase())) {
      showToast(t("playlists.already_in_playlist"), "info");
      return;
    }
    setAddingKeys((prev) => new Set(prev).add(key));
    try {
      await api.addPlaylistItem(playlist.id, payload);
      showToast(t("playlists.add_success", { title: payload.title, playlist: playlist.name }), "success");
      onAdded();
    } catch (err) {
      showToast(t("playlists.add_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAddingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [addingKeys, existingTitles, playlist, onAdded, showToast, t]);

  const handleClose = useCallback(() => {
    setQuery("");
    setSearchResults([]);
    setSearchDone(false);
    setSearchError("");
    setTab("library");
    onClose();
  }, [onClose]);

  return (
    <Modal open={open} onClose={handleClose} title={t("playlists.add_items")}>
      {/* Tabs */}
      <div className="flex items-center gap-1.5 mb-3">
        {[
          { id: "library" as const, label: t("playlists.add_from_library"), icon: Library },
          { id: "search" as const, label: t("playlists.search_global"), icon: Globe },
        ].map((tabOpt) => (
          <button
            key={tabOpt.id}
            className={`pill flex items-center gap-1 ${tab === tabOpt.id ? "active" : ""}`}
            onClick={() => setTab(tabOpt.id)}
          >
            <tabOpt.icon size={11} />
            {tabOpt.label}
          </button>
        ))}
      </div>

      {tab === "library" ? (
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
          {libraryLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          ) : libraryItems.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">{t("playlists.no_library_items")}</p>
            </div>
          ) : (
            libraryItems.map((item) => {
              const alreadyIn = existingTitles.has(item.title.toLowerCase());
              const isAdding = addingKeys.has(`lib:${item.id}`);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/20 transition-all card-lift"
                >
                  <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-muted border border-border-subtle">
                    {item.poster_url ? (
                      <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Film size={13} className="text-muted-foreground/40" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2" title={item.title}>{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {item.year != null && <span className="text-[10px] text-muted-foreground tabular-nums">{item.year}</span>}
                      {item.media_type === "tv" && (
                        <span className="text-[10px] px-1 py-0.5 rounded-full text-sky border border-sky/30 bg-sky/5 leading-none">TV</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-xs shrink-0 gap-1"
                    disabled={isAdding || alreadyIn}
                    onClick={() => addItem({
                      media_id: item.id,
                      title: item.title,
                      year: item.year,
                      genre: item.genre,
                      media_type: item.media_type,
                      poster_url: item.poster_url,
                      tmdb_id: item.tmdb_id,
                    })}
                  >
                    {isAdding ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : alreadyIn ? (
                      <span className="text-[11px]">{t("playlists.already_in_playlist")}</span>
                    ) : (
                      <>
                        <Plus size={12} />
                        {t("wishlist.add")}
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={t("playlists.search_placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                className="input-field w-full h-10 text-sm pl-3 pr-9"
              />
              {query && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  onClick={() => { setQuery(""); setSearchResults([]); setSearchDone(false); setSearchError(""); }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              )}
            </div>
            <button className="btn btn-primary btn-sm shrink-0 gap-1.5" onClick={handleSearch} disabled={searchLoading || !query.trim()}>
              {searchLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              {t("common.search")}
            </button>
          </div>

          {searchLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          ) : searchDone && searchResults.length === 0 && !searchError ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">{t("wishlist.search_empty", { query })}</p>
            </div>
          ) : searchError ? (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{searchError}</div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {searchResults.map((r) => {
                const alreadyIn = existingTitles.has(r.title.toLowerCase());
                const isAdding = addingKeys.has(`ext:${r.title}|${r.year ?? ""}`);
                return (
                  <SearchResultCard
                    key={`${r.source}:${r.source_id}`}
                    result={r}
                    progressivePoster
                    adding={isAdding}
                    alreadyAdded={alreadyIn}
                    addLabel={t("wishlist.add")}
                    onAdd={() => addItem({
                      title: r.title,
                      year: r.year,
                      genre: r.genre || null,
                      media_type: r.media_type,
                      poster_url: r.poster_url,
                      tmdb_id: r.source === "tmdb" ? r.source_id : null,
                    })}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
