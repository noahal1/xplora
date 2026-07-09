import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { MediaItem, Recommendation, ChatMessage, ExternalDetail, DBSession, DBSessionDetail } from "../types";
import * as api from "../api";
import { exportJSON } from "../utils/export";
import { useToast } from "../context/ToastContext";
import { SkeletonCard } from "./Skeleton";
import FadeContent from "./FadeContent";
import { Sparkles } from "lucide-react";
import { isAbortError, getErrMsg, titleMatches, titleInSet } from "../lib/utils";
import { useGenreExtractor } from "../hooks/useGenreExtractor";
import { ChatPanel } from "./tabs/recommend/ChatPanel";
import { StrategySelector } from "./tabs/recommend/StrategySelector";
import { SessionHistory } from "./tabs/recommend/SessionHistory";
import { TMDBDetailModal } from "./shared/TMDBDetailModal";
import { ResultsSection } from "./tabs/recommend/ResultsSection";


export function RecommendTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  const tRef = useRef(t);
  tRef.current = t;

  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [wishlistTitles, setWishlistTitles] = useState<Set<string>>(new Set());
  const [watchedTmdbIds, setWatchedTmdbIds] = useState<Set<string>>(new Set());
  const [wishlistTmdbIds, setWishlistTmdbIds] = useState<Set<string>>(new Set());
  const [loadingMovies, setLoadingMovies] = useState(true);

  const [selectedModel, setSelectedModel] = useState("deepseek");
  const [recCount, setRecCount] = useState(5);
  const [strategy, setStrategy] = useState("taste");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState<Set<string>>(new Set());

  // Strategy-specific inputs
  const [strategyMood, setStrategyMood] = useState("");
  const [strategyYearStart, setStrategyYearStart] = useState("");
  const [strategyYearEnd, setStrategyYearEnd] = useState("");

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [modelUsed, setModelUsed] = useState("");
  const [sourceInfo, setSourceInfo] = useState("");
  const [addingToWishlist, setAddingToWishlist] = useState<Record<number, boolean>>({});

  const cancelRef = useRef<AbortController | null>(null);
  const cancelledByUserRef = useRef(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const [detailData, setDetailData] = useState<ExternalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  /* ── History / past sessions ───────────────────────────── */
  const [sessions, setSessions] = useState<DBSession[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsPage, setSessionsPage] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DBSessionDetail | null>(null);
  const [selectedSessionLoading, setSelectedSessionLoading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [sessionPosterMap, setSessionPosterMap] = useState<Record<number, string | null>>({});
  const [addingFromSession, setAddingFromSession] = useState<Record<number, boolean>>({});

  // Load watched movies + wishlist titles from DB on mount
  const loadMoviesFromDB = useCallback(async () => {
    setLoadingMovies(true);
    try {
      const [watchedData, wishlistData] = await Promise.all([
        api.listMedia({ page: 0, page_size: 5000, status: "watched" }),
        api.listMedia({ page: 0, page_size: 5000, status: "wish" }),
      ]);
      setMovies(
        watchedData.media.map((m, i) => ({
          id: i,
          title: m.title,
          rating: m.rating,
          year: m.year,
          genre: m.genre,
          media_type: m.media_type,
        }))
      );
      setWishlistTitles(
        new Set(wishlistData.media.map((m) => m.title.toLowerCase()))
      );
      setWatchedTmdbIds(
        new Set(watchedData.media.map((m) => m.tmdb_id).filter(Boolean))
      );
      setWishlistTmdbIds(
        new Set(wishlistData.media.map((m) => m.tmdb_id).filter(Boolean))
      );
    } catch (err) {
      console.error("Failed to load movies:", err);
      toastRef.current(tRef.current("recommend.load_error"), "error");
    } finally {
      setLoadingMovies(false);
    }
  }, []);

  useEffect(() => {
    loadMoviesFromDB();
    loadSessions(0);
  }, [loadMoviesFromDB]);

  /* ── History: load sessions ─────────────────────────────── */
  const loadSessions = useCallback(async (p: number = 0) => {
    setSessionsLoading(true);
    try {
      const data = await api.listSessions({ page: p, page_size: 10 });
      setSessions(data.sessions);
      setSessionsTotal(data.total);
      setSessionsPage(p);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      toastRef.current(tRef.current("recommend.load_error"), "error");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const viewSession = useCallback(async (id: number) => {
    setSelectedSessionLoading(true);
    setSelectedSession(null);
    setSessionPosterMap({});
    try {
      const data = await api.getSessionDetail(id);
      setSelectedSession(data);
      // Resolve posters in the background
      const posterMap: Record<number, string | null> = {};
      await Promise.allSettled(
        data.recommendations.map(async (rec, idx) => {
          try {
            const searchData = await api.searchMedia(rec.title, "tmdb");
            const matches = searchData.results ?? [];
            const yearMatch = rec.year
              ? matches.find((m) => m.year === rec.year && m.poster_url)
              : undefined;
            const fallback = matches.find((m) => m.poster_url);
            const match = yearMatch ?? fallback ?? matches[0];
            if (match?.poster_url) posterMap[idx] = match.poster_url;
          } catch {
            // Poster resolution is best-effort — silently skip failures
          }
        })
      );
      setSessionPosterMap(posterMap);
    } catch (err) {
      console.error("Failed to load session detail:", err);
    } finally {
      setSelectedSessionLoading(false);
    }
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (deleteTargetId === null) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    try {
      await api.deleteSession(id);
      if (selectedSession?.id === id) setSelectedSession(null);
      showToast(t("history.deleted"), "success");
      loadSessions(sessionsPage);
    } catch (err) {
      showToast(t("history.delete_failed", { message: getErrMsg(err) }), "error");
    }
  }, [deleteTargetId, selectedSession, sessionsPage, loadSessions, showToast, t]);

  const addRecToWishlist = useCallback(async (rec: Recommendation, idx: number) => {
    if (addingFromSession[idx]) return;
    setAddingFromSession((prev) => ({ ...prev, [idx]: true }));
    try {
      await api.addToWishlist({ title: rec.title, year: rec.year, genre: rec.genre || null });
      showToast(t("wishlist.added_to_wishlist", { title: rec.title }), "success");
    } catch (err) {
      showToast(t("wishlist.add_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAddingFromSession((prev) => ({ ...prev, [idx]: false }));
    }
  }, [addingFromSession, showToast, t]);

  /* ── Build strategy params ──────────────────────────────── */
  const getStrategyParams = useCallback(() => {
    switch (strategy) {
      case "mood":
        return { mood: strategyMood };
      case "era":
        return {
          year_start: strategyYearStart ? parseInt(strategyYearStart, 10) : undefined,
          year_end: strategyYearEnd ? parseInt(strategyYearEnd, 10) : undefined,
        };
      default:
        return undefined;
    }
  }, [strategy, strategyMood, strategyYearStart, strategyYearEnd]);

  // Derive unique genre tags from watched movies
  const uniqueGenres = useGenreExtractor(movies);

  const filteredMovies = useMemo(() => {
    let result = mediaTypeFilter === "all" ? movies : movies.filter((m) => m.media_type === mediaTypeFilter);
    if (genreFilter.size > 0) {
      result = result.filter((m) => m.genre && Array.from(genreFilter).some((g) => m.genre!.toLowerCase().includes(g.toLowerCase())));
    }
    return result;
  }, [movies, mediaTypeFilter, genreFilter]);

  const generateRecommendations = useCallback(async () => {
    if (movies.length < 2) {
      showToast(t("recommend.need_more_movies"), "error");
      return;
    }
    if (filteredMovies.length < 2) {
      showToast(t("recommend.need_more_movies"), "error");
      return;
    }
    setIsLoading(true);
    setElapsedSeconds(0);
    setRecommendations([]);
    setChatMessages([]);
    setShowChat(false);
    setAddingToWishlist({});
    const modelNames: Record<string, string> = { deepseek: "DeepSeek", openai: "OpenAI (GPT-4o)" };
    setModelUsed(modelNames[selectedModel] || selectedModel);

    const controller = new AbortController();
    cancelRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const sp = getStrategyParams();
      const data = await api.getRecommendations({
        movies: filteredMovies.map((m) => ({ title: m.title, rating: m.rating, year: m.year, genre: m.genre })),
        model: selectedModel,
        count: recCount,
        strategy,
        strategy_params: sp || undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Enrich each recommendation with watched/wishlist info
      // Priority: TMDB ID exact match > title fuzzy match
      const wishlistTitlesArray = Array.from(wishlistTitles);
      const recs: Recommendation[] = data.recommendations.map((rec) => {
        // TMDB ID exact match (preferred — handles cross-language)
        if (rec.tmdb_id) {
          const watched = watchedTmdbIds.has(rec.tmdb_id);
          const inWishlist = wishlistTmdbIds.has(rec.tmdb_id);
          if (watched || inWishlist) {
            return { ...rec, poster_url: rec.poster_url || null, watched, inWishlist };
          }
        }
        // Fallback: title fuzzy match for items without tmdb_id or no match
        const matched = movies.find((m) => titleMatches(m.title, rec.title));
        return {
          ...rec,
          poster_url: rec.poster_url || null,
          media_type: matched?.media_type || rec.media_type,
          watched: !!matched,
          inWishlist: titleInSet(rec.title, wishlistTitlesArray),
        };
      });

      setSourceInfo(t("recommend.source_info_done", { count: data.source_count, recs: recs.length }));

      if (recs.length === 0) {
        showToast(t("recommend.no_results"), "error");
      } else {
        setRecommendations(recs);
        setShowChat(true);
      }
    } catch (err) {
      if (isAbortError(err)) {
        if (!cancelledByUserRef.current) {
          showToast(t("recommend.timeout"), "error");
        }
        cancelledByUserRef.current = false;
      } else {
        showToast(t("recommend.error", { message: getErrMsg(err) }), "error");
      }
    } finally {
      clearTimeout(timeoutId);
      cancelRef.current = null;
      cancelledByUserRef.current = false;
      setIsLoading(false);
    }
  }, [movies, filteredMovies, selectedModel, recCount, strategy, getStrategyParams, showToast, t]);

  // ── Cancel loading handler ──
  const handleCancel = useCallback(() => {
    cancelledByUserRef.current = true;
    cancelRef.current?.abort();
    cancelRef.current = null;
    setIsLoading(false);
  }, []);

  // ── Elapsed time counter while loading ──
  useEffect(() => {
    if (!isLoading) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const sendFollowUp = useCallback(async (text: string) => {
    if (!text.trim() || isChatProcessing) return;
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsChatProcessing(true);

    // Use the same filters (media type + genre) as the main recommendation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const token = localStorage.getItem("xplora-token");
      const response = await fetch("/api/recommend/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          movies: filteredMovies.map((m) => ({ title: m.title, rating: m.rating, year: m.year, genre: m.genre })),
          previous_recommendations: recommendations,
          conversation: chatMessages,
          question: text,
          model: selectedModel,
          count: Math.min(3, recCount),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: t("recommend.server_error") }));
        throw new Error(err.detail || t("recommend.request_failed"));
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventType = "message";
          let eventData = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }
          if (!eventData) continue;
          try {
            const data = JSON.parse(eventData);
            switch (eventType) {
              case "chunk":
                accumulatedText += data.text || "";
                setChatMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") next[next.length - 1] = { ...last, content: accumulatedText };
                  else next.push({ role: "assistant", content: accumulatedText });
                  return next;
                });
                break;
              case "result":
                const msg = data.message || accumulatedText;
                setChatMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") next[next.length - 1] = { ...last, content: msg };
                  else next.push({ role: "assistant", content: msg });
                  return next;
                });
                if (data.recommendations) setRecommendations((prev) => [...prev, ...data.recommendations]);
                break;
              case "error":
                throw new Error(data.message);
            }
          } catch {
            console.warn("SSE parse warning (followup): invalid event data", eventData);
          }
        }
      }

      if (!accumulatedText.trim()) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: t("recommend.chat_error") }]);
      }
    } catch (err) {
      if (!isAbortError(err)) showToast(t("recommend.error", { message: getErrMsg(err) }), "error");
    } finally {
      clearTimeout(timeoutId);
      setIsChatProcessing(false);
    }
  }, [filteredMovies, recommendations, chatMessages, selectedModel, recCount, isChatProcessing, showToast, t]);

  const closeDetail = useCallback(() => {
    setDetailRec(null);
    setDetailData(null);
    setDetailError("");
  }, []);

  // Fetch TMDB detail when recommendation detail modal opens (with race condition guard)
  useEffect(() => {
    if (!detailRec) return;
    let cancelled = false;
    setDetailData(null);
    setDetailError("");
    setDetailLoading(true);
    (async () => {
      try {
        const searchData = await api.searchMedia(detailRec.title, "tmdb");
        if (cancelled) return;
        const matches = searchData.results ?? [];
        const yearMatch = detailRec.year
          ? matches.find((m) => m.year === detailRec.year)
          : undefined;
        const match = yearMatch ?? matches[0];
        if (match?.source && match?.source_id) {
          const data = await api.getExternalDetail(match.source, match.source_id);
          if (cancelled) return;
          setDetailData(data);
        } else {
          setDetailError(t("wishlist.search_empty", { query: detailRec.title }));
        }
      } catch (err) {
        if (cancelled) return;
        setDetailError(getErrMsg(err));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [detailRec, t]);



  // Stable ref to avoid frequent keydown rebind
  const generateRef = useRef(generateRecommendations);
  generateRef.current = generateRecommendations;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isLoading && movies.length >= 2) generateRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isLoading, movies.length]);

  const handleExportJSON = useCallback(() => {
    if (recommendations.length === 0) { showToast(t("recommend.export_no_results"), "error"); return; }
    exportJSON(recommendations, modelUsed, sourceInfo);
    showToast(t("recommend.export_json_success"), "success");
  }, [recommendations, modelUsed, sourceInfo, showToast, t]);

  const addToWishlist = useCallback(async (rec: Recommendation, idx: number) => {
    if (addingToWishlist[idx] || rec.inWishlist) return;
    setAddingToWishlist((prev) => ({ ...prev, [idx]: true }));
    try {
      await api.addToWishlist({ title: rec.title, year: rec.year, genre: rec.genre || null });
      showToast(t("wishlist.added_to_wishlist", { title: rec.title }), "success");
      // Mark as inWishlist immediately so the card shows "已添加"
      setRecommendations((prev) => {
        const next = [...prev];
        if (next[idx]) next[idx] = { ...next[idx], inWishlist: true };
        return next;
      });
      setWishlistTitles((prev) => new Set(prev).add(rec.title.toLowerCase()));
    } catch (err) {
      showToast(t("wishlist.add_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setAddingToWishlist((prev) => ({ ...prev, [idx]: false }));
    }
  }, [addingToWishlist, showToast, t]);

  // -- Loading state for initial data fetch
  if (loadingMovies) {
    return (
      <FadeContent className="section-card">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[var(--border-default)] border-t-[var(--seed-primary)] rounded-full animate-stream-spin" />
          <span className="ml-2 text-sm" style={{ color: "var(--fg-muted)" }}>{t("recommend.loading_movies")}</span>
        </div>
      </FadeContent>
    );
  }

  return (
    <div className="space-y-5">
      {/* === Empty / Config State === */}
      {!isLoading && recommendations.length === 0 ? (
        <FadeContent className="section-card">
          <StrategySelector
            strategy={strategy}
            onStrategyChange={setStrategy}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            recCount={recCount}
            onRecCountChange={(n) => setRecCount(n)}
            strategyMood={strategyMood}
            onMoodChange={setStrategyMood}
            strategyYearStart={strategyYearStart}
            onYearStartChange={setStrategyYearStart}
            strategyYearEnd={strategyYearEnd}
            onYearEndChange={setStrategyYearEnd}
            mediaTypeFilter={mediaTypeFilter}
            onMediaTypeFilterChange={setMediaTypeFilter}
            genreFilter={genreFilter}
            onGenreFilterChange={setGenreFilter}
            uniqueGenres={uniqueGenres}
            filteredCount={filteredMovies.length}
            onGenerate={generateRecommendations}
            t={t}
          />
        </FadeContent>
      ) : null}

      {/* === Loading State === */}
      {isLoading && recommendations.length === 0 && (
        <FadeContent className="section-card overflow-hidden">
          {/* Indeterminate progress bar */}
          <div className="progress-bar mb-6" />

          <div className="flex flex-col items-center justify-center py-10">
            <div className="spinner mb-4" />
            <p className="text-sm font-[510]" style={{ color: "var(--fg-secondary)" }}>
              {t("recommend.analyzing")}
            </p>
            {/* Elapsed time */}
            <p className="text-xs mt-3 tabular-nums" style={{ color: "var(--fg-muted)" }}>
              {elapsedSeconds < 60
                ? `${elapsedSeconds}s`
                : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`}
            </p>
            {/* Cancel button */}
            <button
              onClick={handleCancel}
              className="btn btn-xs btn-ghost mt-5"
            >
              {t("recommend.cancel_generating")}
            </button>
          </div>
          <SkeletonCard count={3} />
        </FadeContent>
      )}

      {/* === Results Section === */}
      {recommendations.length > 0 && (
        <ResultsSection
          recommendations={recommendations}
          modelUsed={modelUsed}
          strategy={strategy}
          sourceInfo={sourceInfo}
          addingToWishlist={addingToWishlist}
          onAddToWishlist={addToWishlist}
          onOpenDetail={setDetailRec}
          onNewSession={() => { setRecommendations([]); setShowChat(false); setChatMessages([]); setAddingToWishlist({}); }}
          onExportJSON={handleExportJSON}
          t={t}
        />
      )}

      <TMDBDetailModal
        open={detailRec !== null}
        title={detailRec?.title}
        loading={detailLoading}
        error={detailError}
        data={detailData}
        recommendation={detailRec}
        mediaType={detailRec?.media_type}
        tagline={detailData?.tagline}
        onClose={closeDetail}
        t={t}
      />

      {/* === Recommendation History Section === */}
      <SessionHistory
        sessions={sessions}
        sessionsTotal={sessionsTotal}
        sessionsPage={sessionsPage}
        sessionsLoading={sessionsLoading}
        selectedSession={selectedSession}
        selectedSessionLoading={selectedSessionLoading}
        deleteTargetId={deleteTargetId}
        sessionPosterMap={sessionPosterMap}
        addingFromSession={addingFromSession}
        onLoadSessions={loadSessions}
        onViewSession={viewSession}
        onBackToList={() => { setSelectedSession(null); setSessionPosterMap({}); setAddingFromSession({}); }}
        onConfirmDeleteSession={confirmDeleteSession}
        onSetDeleteTarget={setDeleteTargetId}
        onAddRecToWishlist={addRecToWishlist}
        onOpenDetail={setDetailRec}
        t={t}
      />

      {/* === Chat Panel === */}
      {showChat && (
        <ChatPanel
          messages={chatMessages}
          isProcessing={isChatProcessing}
          onSend={sendFollowUp}
        />
      )}
    </div>
  );
}
