import { useState, useEffect, useCallback, useRef } from "react";
import {
  Award, Star, Film, Trophy,
  Pencil, Check, Plus, X, Search, RefreshCw,
} from "lucide-react";
import FadeContent from "./FadeContent";
import { Modal } from "./Modal";
import { DetailModal } from "./ManageTab/DetailModal";
import {
  fetchTopRated, reorderTopRated, addToTopRated, removeFromTopRated,
  listMedia,
} from "../api";
import type { MediaDetail } from "../types";
import { useDebouncedSearch } from "../hooks/useDebouncedSearch";
import { TopRatedCard } from "./tabs/top_rated/TopRatedCard";
import { useToast } from "../context/ToastContext";



export function TopRatedTab() {
  const [movies, setMovies] = useState<MediaDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailMovie, setDetailMovie] = useState<MediaDetail | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [animated, setAnimated] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // ── Remove confirmation ─────────────────────────────────
  const [confirmRemove, setConfirmRemove] = useState<MediaDetail | null>(null);

  // ── Search / Add modal ──────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchResults, setSearchResults] = useState<MediaDetail[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const { showToast } = useToast();
  const searchRef = useRef<HTMLDivElement>(null);
  const MAX_ITEMS = 10;

  // ── Replace modal (当排行榜已满时选择替换哪一部) ────────
  const [replacePending, setReplacePending] = useState<{
    newId: number;
    newTitle: string;
  } | null>(null);
  const [replacing, setReplacing] = useState(false);

  const { input: searchQuery, setInput: setSearchQuery, debouncedValue: debouncedSearchQuery } = useDebouncedSearch("", 300);

  // Trigger entrance animation after mount
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTopRated();
      setMovies(data);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Search watched items ─────────────────────────────────
  useEffect(() => {
    if (!debouncedSearchQuery || !showAddModal) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    listMedia({ search: debouncedSearchQuery, status: "watched", page_size: 20 })
      .then(({ media }) => {
        if (cancelled) return;
        // Filter out items already in the top list
        const topIds = new Set(movies.map((m) => m.id));
        setSearchResults(media.filter((m) => !topIds.has(m.id)));
      })
      .catch(() => { if (!cancelled) setSearchResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedSearchQuery, showAddModal, movies]);

  // Close add modal on outside click
  useEffect(() => {
    if (!showAddModal) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowAddModal(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddModal]);

  const handleAdd = async (mediaId: number, title: string) => {
    // If list is already full, open replace modal instead
    if (movies.length >= MAX_ITEMS) {
      setReplacePending({ newId: mediaId, newTitle: title });
      setShowAddModal(false);
      setSearchQuery("");
      return;
    }

    setAdding(mediaId);
    try {
      const { item } = await addToTopRated(mediaId);
      setMovies((prev) => [...prev, item]);
      setSearchResults((prev) => prev.filter((m) => m.id !== mediaId));
    } catch { /* ignore */ }
    setAdding(null);
  };

  // ── Replace: remove an existing movie then add the new one ──
  const handleReplace = async (oldId: number) => {
    if (!replacePending) return;
    const { newId, newTitle } = replacePending;
    setReplacing(true);
    try {
      await removeFromTopRated(oldId);
      await addToTopRated(newId);
      // Re-fetch the full list from backend to ensure consistency
      const updated = await fetchTopRated();
      setMovies(updated);
      showToast(`已将「${newTitle}」加入排行榜`, "success");
    } catch (e: any) {
      showToast(e.message || "替换失败，请重试", "error");
    }
    setReplacePending(null);
    setReplacing(false);
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return;
    const id = confirmRemove.id;
    setConfirmRemove(null);
    try {
      await removeFromTopRated(id);
      setMovies((prev) => prev.filter((m) => m.id !== id));
    } catch { /* ignore */ }
  };

  // ── Drag & Drop ──────────────────────────────────────────

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  };

  const handleDragEnd = async () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }

    const reordered = [...movies];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(overIdx, 0, moved);
    setMovies(reordered);
    setDragIdx(null);
    setOverIdx(null);

    // Persist
    setSaving(true);
    try {
      await reorderTopRated(reordered.map((m) => m.id));
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    const reordered = [...movies];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    setMovies(reordered);
    setSaving(true);
    reorderTopRated(reordered.map((m) => m.id)).finally(() => setSaving(false));
  };

  const handleMoveDown = (idx: number) => {
    if (idx === movies.length - 1) return;
    const reordered = [...movies];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    setMovies(reordered);
    setSaving(true);
    reorderTopRated(reordered.map((m) => m.id)).finally(() => setSaving(false));
  };

  const toggleEditMode = () => {
    if (editMode) {
      // Exiting edit mode — save current order
      setSaving(true);
      reorderTopRated(movies.map((m) => m.id)).finally(() => setSaving(false));
    }
    setEditMode(!editMode);
  };

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <FadeContent className="section-card">
        <div className="flex items-center justify-center py-20">
          <div className="relative">
            <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Trophy size={14} className="text-primary/60" />
            </div>
          </div>
        </div>
      </FadeContent>
    );
  }

  if (error) {
    return (
      <FadeContent className="section-card">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Award size={40} className="opacity-20" />
          <p className="text-sm opacity-60">{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={loadData}>重试</button>
        </div>
      </FadeContent>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <FadeContent className="section-card" style={{ position: "relative", zIndex: 1 }}>
        <div className="section-header">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #f59e0b, #eab308)" }}
            >
              <Trophy size={14} className="text-white" />
            </div>
            <h2 className="section-title">Top 排行榜</h2>
            <span className="text-[10px] opacity-30 ml-1">{movies.length}/{MAX_ITEMS}</span>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] animate-pulse opacity-40">保存中...</span>}
            {editMode && (
              <span className="text-[10px] opacity-40">拖拽或点击上下箭头排序</span>
            )}

            {/* Add button */}
            <div className="relative" ref={searchRef}>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => { setShowAddModal(!showAddModal); setSearchQuery(""); }}
                title="搜索添加"
              >
                <Plus size={13} className="mr-0.5" />
                添加
              </button>

              {/* Search dropdown */}
              {showAddModal && (
                <div
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-xl shadow-xl z-50 overflow-hidden bg-popover border border-border transition-none"
                >
                  <div className="p-2 border-b" style={{ borderColor: "var(--border-default)" }}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "var(--bg-input)" }}>
                      <Search size={13} className="opacity-40 shrink-0" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索已看的电影/剧集..."
                        className="flex-1 bg-transparent outline-none text-xs"
                        autoFocus
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="opacity-30 hover:opacity-60">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {searching && (
                      <div className="flex items-center justify-center py-6">
                        <RefreshCw size={14} className="animate-spin opacity-30" />
                      </div>
                    )}
                    {!searching && searchQuery && searchResults.length === 0 && (
                      <div className="text-center py-6 text-[11px] opacity-30">
                        没有找到可添加的条目
                      </div>
                    )}
                    {!searching && !searchQuery && (
                      <div className="text-center py-6 text-[11px] opacity-30">
                        输入关键词搜索已看的媒体
                      </div>
                    )}
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent/20 transition-colors text-left"
                        onClick={() => handleAdd(item.id, item.title)}
                        disabled={adding === item.id}
                      >
                        {item.poster_url ? (
                          <img
                            src={item.poster_url}
                            alt=""
                            className="w-6 h-8 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-8 rounded flex items-center justify-center shrink-0" style={{ background: "var(--bg-input)" }}>
                            <Film size={10} className="opacity-20" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{item.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.rating > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] opacity-50">
                                <Star size={8} fill="currentColor" /> {item.rating.toFixed(1)}
                              </span>
                            )}
                            {item.year && <span className="text-[10px] opacity-30">{item.year}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] opacity-30 shrink-0">
                          {adding === item.id ? "添加中..." : "+ 添加"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              className={`btn btn-xs ${editMode ? "btn-primary" : "btn-ghost"}`}
              onClick={toggleEditMode}
            >
              {editMode ? (
                <><Check size={12} className="mr-1" />完成</>
              ) : (
                <><Pencil size={12} className="mr-1" />编辑排序</>
              )}
            </button>
            <button className="btn btn-ghost btn-xs" onClick={loadData} title="刷新">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>
        </div>
      </FadeContent>

      {/* ── Empty State ─────────────────────────────── */}
      {movies.length === 0 && (
        <FadeContent className="section-card">
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Trophy size={48} className="opacity-10" />
            <div className="text-center">
              <p className="text-sm opacity-50 mb-1">排行榜还是空的</p>
              <p className="text-[11px] opacity-30">点击上方「添加」按钮，搜索并添加你喜欢的电影</p>
            </div>
            <button
              className="btn btn-primary btn-sm gap-1.5 mt-2"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={14} />
              添加第一部
            </button>
          </div>
        </FadeContent>
      )}

      {/* ── Movie List ─────────────────────────────── */}
      {movies.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          {movies.map((movie, idx) => (
            <TopRatedCard
              key={movie.id}
              movie={movie}
              index={idx}
              total={movies.length}
              editMode={editMode}
              animated={animated}
              isDragOver={overIdx === idx}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onRemove={(m) => setConfirmRemove(m)}
              onClick={(m) => setDetailMovie(m)}
            />
          ))}
        </div>
      )}

      {/* Remove Confirmation */}
      {confirmRemove && (
        <Modal
          open={true}
          onClose={() => setConfirmRemove(null)}
          title="确认移除"
          description={`确定要将「${confirmRemove.title}」从排行榜中移除吗？`}
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(null)}>取消</button>
              <button className="btn btn-destructive btn-sm" onClick={handleConfirmRemove}>移除</button>
            </>
          }
        />
      )}

      {/* Replace Modal — pick which movie to replace */}
      {replacePending && (
        <Modal
          open={true}
          onClose={() => setReplacePending(null)}
          title={
            <div className="flex items-center gap-2">
              <span>排行榜已满，替换哪一部？</span>
              <span className="text-[11px] opacity-40 font-normal">10/10</span>
            </div>
          }
          description={`选择要被「${replacePending.newTitle}」替换的电影`}
          footer={
            <button className="btn btn-ghost btn-sm" onClick={() => setReplacePending(null)}>
              取消
            </button>
          }
        >
          <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
            {movies.map((m, idx) => (
              <button
                key={m.id}
                disabled={replacing}
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-accent/20 transition-colors text-left disabled:opacity-40"
                onClick={() => handleReplace(m.id)}
              >
                {/* Rank badge */}
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{
                    background: idx < 3
                      ? `linear-gradient(135deg, ${idx === 0 ? "#f59e0b" : idx === 1 ? "#94a3b8" : "#b45309"}, ${idx === 0 ? "#eab308" : idx === 1 ? "#cbd5e1" : "#d97706"})`
                      : "var(--bg-input)",
                    color: idx < 3 ? "#fff" : "var(--fg-secondary)",
                  }}
                >
                  {idx + 1}
                </span>

                {/* Poster */}
                {m.poster_url ? (
                  <img src={m.poster_url} alt="" className="w-7 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-7 h-10 rounded flex items-center justify-center shrink-0" style={{ background: "var(--bg-input)" }}>
                    <Film size={10} className="opacity-20" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="flex items-center gap-0.5 text-[10px] opacity-50">
                      <Star size={8} fill="currentColor" /> {m.rating.toFixed(1)}
                    </span>
                    {m.year && <span className="text-[10px] opacity-30">{m.year}</span>}
                  </div>
                </div>

                {/* Arrow */}
                <svg className="w-3.5 h-3.5 opacity-30 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      <DetailModal
        open={detailMovie !== null}
        movie={detailMovie}
        onClose={() => setDetailMovie(null)}
      />
    </div>
  );
}
