import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MediaItem, Recommendation, ChatMessage } from "../types";
import * as api from "../api";
import { exportJSON, exportScreenshot } from "../utils/export";
import { useToast } from "../context/ToastContext";
import { SkeletonCard } from "./Skeleton";
import { Modal } from "./Modal";
import {
  Sparkles, Send, Percent, MessageSquare, Film,
  Brain, Bot, Trophy, Heart, Calendar, Gem, Compass, Star,
} from "lucide-react";
import { Badge } from "./ui/badge";

const STRATEGIES = [
  { id: "taste", icon: Heart },
  { id: "classics", icon: Trophy },
  { id: "mood", icon: Sparkles },
  { id: "era", icon: Calendar },
  { id: "gems", icon: Gem },
  { id: "explore", icon: Compass },
] as const;

export function RecommendTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(true);

  const [selectedModel, setSelectedModel] = useState("deepseek");
  const [recCount, setRecCount] = useState(5);
  const [strategy, setStrategy] = useState("taste");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");

  // Strategy-specific inputs
  const [strategyMood, setStrategyMood] = useState("");
  const [strategyYearStart, setStrategyYearStart] = useState("");
  const [strategyYearEnd, setStrategyYearEnd] = useState("");

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modelUsed, setModelUsed] = useState("");
  const [sourceInfo, setSourceInfo] = useState("");

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);

  // Load watched movies from DB on mount
  const loadMoviesFromDB = useCallback(async () => {
    setLoadingMovies(true);
    try {
      const data = await api.listMedia({ page: 0, page_size: 500, status: "watched" });
      setMovies(
        data.media.map((m, i) => ({
          id: i,
          title: m.title,
          rating: m.rating,
          year: m.year,
          genre: m.genre,
          media_type: m.media_type,
        }))
      );
    } catch {} finally {
      setLoadingMovies(false);
    }
  }, []);

  useEffect(() => {
    loadMoviesFromDB();
  }, [loadMoviesFromDB]);

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
  const uniqueGenres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => {
      if (m.genre) {
        m.genre.split("/").forEach((g) => {
          const trimmed = g.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    });
    return Array.from(set).sort();
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result = mediaTypeFilter === "all" ? movies : movies.filter((m) => m.media_type === mediaTypeFilter);
    if (genreFilter !== "all") {
      result = result.filter((m) => m.genre && m.genre.toLowerCase().includes(genreFilter.toLowerCase()));
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
    setRecommendations([]);
    setChatMessages([]);
    setShowChat(false);
    const modelNames: Record<string, string> = { deepseek: "DeepSeek", openai: "OpenAI (GPT-4o)" };
    setModelUsed(modelNames[selectedModel] || selectedModel);
    setSourceInfo(t("recommend.source_info_loading", { count: filteredMovies.length }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const payload: Record<string, unknown> = {
        movies: filteredMovies.map((m) => ({ title: m.title, rating: m.rating, year: m.year, genre: m.genre })),
        model: selectedModel,
        count: recCount,
        strategy,
      };
      const sp = getStrategyParams();
      if (sp) payload.strategy_params = sp;

      const token = localStorage.getItem("xplore-token");
      const response = await fetch("/api/recommend/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
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
      const recs: Recommendation[] = [];

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
              case "start":
                setSourceInfo(t("recommend.source_info_loading", { count: data.source_count }));
                break;
              case "recommendation": {
                const rec: Recommendation = { title: data.title, year: data.year, genre: data.genre, reason: data.reason, confidence: data.confidence };
                // Try to find media_type from all watched movies
                const matched = movies.find((m) => m.title.toLowerCase() === (data.title || "").toLowerCase());
                if (matched?.media_type) rec.media_type = matched.media_type;
                recs.push(rec);
                setRecommendations([...recs]);
                break;
              }
              case "done":
                setSourceInfo(t("recommend.source_info_done", { count: data.source_count, recs: recs.length }));
                break;
              case "error":
                throw new Error(data.message);
            }
          } catch {}
        }
      }

      if (recs.length === 0) showToast(t("recommend.no_results"), "error");
      else {
        setShowChat(true);
        // Fetch poster URLs from TMDB for each recommendation (async, from CDN)
        resolvePosters(recs).then((withPosters) => {
          setRecommendations(withPosters);
        });
      }
    } catch (err: any) {
      if (err.name === "AbortError") showToast(t("recommend.timeout"), "error");
      else showToast(t("recommend.error", { message: err.message }), "error");
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [movies, filteredMovies, selectedModel, recCount, strategy, getStrategyParams, showToast, t]);

  // Search TMDB for poster URLs after recommendations arrive (CDN-only, no caching)
  const resolvePosters = useCallback(async (recs: Recommendation[]): Promise<Recommendation[]> => {
    const results = await Promise.allSettled(
      recs.map(async (rec) => {
        try {
          const data = await api.searchMedia(rec.title, "tmdb");
          const match = data.results?.[0];
          if (match?.poster_url) {
            return { ...rec, poster_url: match.poster_url };
          }
        } catch { /* silent — poster not found, keep placeholder */ }
        return rec;
      })
    );
    return results.map((r, i) => (r.status === "fulfilled" ? r.value : recs[i]));
  }, []);

  const sendFollowUp = useCallback(async () => {
    const input = chatInputRef.current;
    if (!input || !input.value.trim() || isChatProcessing) return;
    const text = input.value.trim();
    input.value = "";
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsChatProcessing(true);

    // Use the same filters (media type + genre) as the main recommendation
    const followUpMovies = filteredMovies

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const token = localStorage.getItem("xplore-token");
      const response = await fetch("/api/recommend/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          movies: followUpMovies.map((m) => ({ title: m.title, rating: m.rating, year: m.year, genre: m.genre })),
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
          } catch {}
        }
      }

      if (!accumulatedText.trim()) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: t("recommend.chat_error") }]);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") showToast(t("recommend.error", { message: err.message }), "error");
    } finally {
      clearTimeout(timeoutId);
      setIsChatProcessing(false);
    }
  }, [filteredMovies, recommendations, chatMessages, selectedModel, recCount, isChatProcessing, showToast, t]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isLoading && movies.length >= 2) generateRecommendations();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isLoading, movies.length, generateRecommendations]);

  const handleExportJSON = useCallback(() => {
    if (recommendations.length === 0) { showToast(t("recommend.export_no_results"), "error"); return; }
    exportJSON(recommendations, modelUsed, sourceInfo);
    showToast(t("recommend.export_json_success"), "success");
  }, [recommendations, modelUsed, sourceInfo, showToast, t]);

  const handleExportScreenshot = useCallback(async () => {
    if (!resultsRef.current) return;
    try {
      await exportScreenshot(resultsRef.current);
      showToast(t("recommend.export_screenshot_success"), "success");
    } catch (err: any) { showToast(err.message, "error"); }
  }, [showToast, t]);

  // -- Loading state for initial data fetch
  if (loadingMovies) {
    return (
      <section className="section-card">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[var(--border-default)] border-t-[var(--seed-primary)] rounded-full animate-stream-spin" />
          <span className="ml-2 text-sm" style={{ color: "var(--fg-muted)" }}>{t("recommend.loading_movies")}</span>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* === Empty / Config State === */}
      {!isLoading && recommendations.length === 0 ? (
        <section className="section-card">
          <div className="flex flex-col items-center py-10 px-4">
            {/* Sparkle icon */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}
            >
              <Sparkles size={20} style={{ color: "var(--seed-primary)" }} />
            </div>
            <h2 className="text-heading mb-2" style={{ color: "var(--seed-fg)" }}>
              {t("recommend.empty_title")}
            </h2>
            <p className="text-body text-center max-w-md mb-6" style={{ color: "var(--fg-muted)" }}>
              {t("recommend.empty_desc")}
            </p>

            {/* ── Strategy Selector Grid ────────────────────── */}
            <div className="w-full max-w-[520px] mb-6">
              <p className="text-label mb-3 text-center" style={{ color: "var(--fg-dim)" }}>
                {t("recommend.strategy_label")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {STRATEGIES.map((s) => {
                  const Icon = s.icon;
                  const isActive = strategy === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStrategy(s.id)}
                      className="relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: isActive ? "var(--accent-glow)" : "var(--bg-input)",
                        border: isActive
                          ? "1px solid var(--primary-30)"
                          : "1px solid var(--border-subtle)",
                        color: isActive ? "var(--seed-accent)" : "var(--fg-muted)",
                      }}
                    >
                      {isActive && (
                        <span
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                          style={{ background: "var(--seed-primary)", color: "#0f0f0f" }}
                        >
                          <Star size={8} fill="currentColor" />
                        </span>
                      )}
                      <Icon size={16} />
                      <span style={{ fontWeight: isActive ? 590 : 510 }}>{t(`recommend.strategy_${s.id}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Media Type Filter ─────────────────────── */}
            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto sm:flex-wrap justify-start sm:justify-center pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              <span className="text-xs text-muted-foreground mr-1">{t("manage.media_type")}</span>
              {[
                { value: "all", label: t("manage.media_type_all") },
                { value: "movie", label: t("manage.media_type_movie") },
                { value: "tv", label: t("manage.media_type_tv") },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`pill ${mediaTypeFilter === opt.value ? "active" : ""}`}
                  onClick={() => setMediaTypeFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* ── Genre Filter ─────────────────────────── */}
            {uniqueGenres.length > 0 && (
              <div className="flex items-center gap-1.5 mb-5 overflow-x-auto sm:flex-wrap justify-start sm:justify-center pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                <span className="text-xs text-muted-foreground mr-1">{t("manage.genre_filter")}</span>
                <select
                  value={genreFilter}
                  onChange={(e) => setGenreFilter(e.target.value)}
                  className="input-field text-xs py-1.5 px-2.5 w-auto max-w-[160px]"
                  style={{ appearance: "auto" }}
                >
                  <option value="all">{t("manage.media_type_all")}</option>
                  {uniqueGenres.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Strategy-specific inputs ──────────────────── */}
            {strategy === "mood" && (
              <div className="w-full max-w-[400px] mb-5">
                <input
                  type="text"
                  value={strategyMood}
                  onChange={(e) => setStrategyMood(e.target.value)}
                  placeholder={t("recommend.strategy_mood_placeholder")}
                  className="input-field text-center"
                />
              </div>
            )}

            {strategy === "era" && (
              <div className="w-full max-w-[320px] mb-5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={strategyYearStart}
                    onChange={(e) => setStrategyYearStart(e.target.value)}
                    placeholder={t("recommend.strategy_era_start")}
                    className="input-field text-center"
                    min={1900}
                    max={2030}
                  />
                  <span className="text-xs" style={{ color: "var(--fg-dim)" }}>—</span>
                  <input
                    type="number"
                    value={strategyYearEnd}
                    onChange={(e) => setStrategyYearEnd(e.target.value)}
                    placeholder={t("recommend.strategy_era_end")}
                    className="input-field text-center"
                    min={1900}
                    max={2030}
                  />
                </div>
              </div>
            )}

            {/* ── Model + Count + Generate ─────────────────── */}
            <div className="flex flex-col items-center gap-4 mb-2">
              {/* Model toggle */}
              <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>
                {[
                  { value: "deepseek", icon: Brain },
                  { value: "openai", icon: Bot },
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedModel(opt.value)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                      style={
                        selectedModel === opt.value
                          ? { background: "var(--seed-primary)", color: "#0f0f0f" }
                          : { color: "var(--fg-muted)" }
                      }
                    >
                      <Icon size={13} />
                      <span>{opt.value === "deepseek" ? "DeepSeek" : "GPT-4o"}</span>
                    </button>
                  );
                })}
              </div>

              {/* Count */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--fg-dim)" }}>{t("recommend.rec_count")}</span>
                <div className="flex items-center gap-1">
                  <button
                    className="w-6 h-6 flex items-center justify-center rounded text-xs font-medium transition-all disabled:opacity-30"
                    style={{ border: "1px solid var(--border-subtle)", color: "var(--fg-muted)" }}
                    disabled={recCount <= 1}
                    onClick={() => setRecCount((c) => Math.max(1, c - 1))}
                  >−</button>
                  <span className="w-6 text-center text-xs font-semibold" style={{ color: "var(--seed-primary)" }}>{recCount}</span>
                  <button
                    className="w-6 h-6 flex items-center justify-center rounded text-xs font-medium transition-all disabled:opacity-30"
                    style={{ border: "1px solid var(--border-subtle)", color: "var(--fg-muted)" }}
                    disabled={recCount >= 20}
                    onClick={() => setRecCount((c) => Math.min(20, c + 1))}
                  >+</button>
                </div>
              </div>

              {/* Generate button */}
              {filteredMovies.length < 2 && (
                <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                  {mediaTypeFilter !== "all"
                    ? t("recommend.need_more_filtered", { type: t(`manage.media_type_${mediaTypeFilter}`) })
                    : t("recommend.need_more_movies")}
                </p>
              )}

              <button
                onClick={generateRecommendations}
                disabled={filteredMovies.length < 2}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                style={{
                  background: filteredMovies.length >= 2 ? "var(--seed-primary)" : "var(--bg-input)",
                  color: filteredMovies.length >= 2 ? "#0f0f0f" : "var(--fg-dim)",
                  border: filteredMovies.length >= 2 ? "none" : "1px solid var(--border-default)",
                }}
              >
                <Sparkles size={14} />
                {t("recommend.generate")}
              </button>

              <p className="text-caption" style={{ color: "var(--fg-dim)" }}>
                {t("recommend.based_on", { count: filteredMovies.length })} · Ctrl+Enter
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* === Loading State === */}
      {isLoading && recommendations.length === 0 && (
        <section className="section-card">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="spinner mb-4" />
            <p className="text-sm font-[510]" style={{ color: "var(--fg-secondary)" }}>
              {t("recommend.analyzing")}
            </p>
            <div className="typing-dots flex justify-center gap-1 mt-2">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <SkeletonCard count={3} />
        </section>
      )}

      {/* === Results Section === */}
      {recommendations.length > 0 && (
        <section className="section-card" ref={resultsRef}>
          <div className="section-header">
            <h2 className="text-heading" style={{ color: "var(--seed-fg)" }}>
              {t("recommend.results")}
            </h2>
            <div className="flex items-center gap-2">
              {modelUsed && <span className="badge">{modelUsed}</span>}
              <span className="badge">{t(`recommend.strategy_${strategy}`)}</span>
            </div>
          </div>

          {sourceInfo && (
            <p className="text-center mb-5 pb-4" style={{ color: "var(--fg-muted)", fontSize: "0.8125rem", borderBottom: "1px solid var(--border-subtle)" }}>
              {sourceInfo}
            </p>
          )}

          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="card p-4 animate-slide-up"
                style={{ animationDelay: `${i * 0.1}s`, animationFillMode: "both" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 flex-1 min-w-0">
                    {/* Poster — loaded from TMDB CDN, no local caching — click for details */}
                    <div
                      className="w-10 h-14 rounded shrink-0 flex items-center justify-center overflow-hidden cursor-pointer ring-1 ring-transparent hover:ring-[var(--seed-primary)] transition-all duration-200"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}
                      onClick={() => setDetailRec(rec)} title={t("recommend.view_detail")}
                    >
                      {rec.poster_url ? (
                        <img src={rec.poster_url} alt={rec.title} className="w-full h-full object-cover" loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <>
                          <svg width="40" height="56" viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="40" height="56" fill="transparent" />
                            <rect x="3" y="3" width="34" height="50" rx="2" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                            <path d="M20 22L25 28H15L20 22Z" fill="rgba(255,255,255,0.08)" />
                            <circle cx="17" cy="19" r="2.5" fill="rgba(255,255,255,0.06)" />
                            <rect x="9" y="38" width="22" height="2.5" rx="1.25" fill="rgba(255,255,255,0.05)" />
                            <rect x="12" y="43" width="16" height="1.5" rx="0.75" fill="rgba(255,255,255,0.03)" />
                          </svg>
                          <Film size={12} style={{ color: "var(--fg-dim)", opacity: 0.5, position: "relative", zIndex: 1 }} />
                        </>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-[590] truncate" style={{ color: "var(--seed-fg)" }}>
                          {rec.title}
                        </p>
                        {rec.media_type === "tv" && (
                          <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
                        )}
                        {rec.genre && <span className="badge">{rec.genre}</span>}
                      </div>
                      {rec.year && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>{rec.year}</p>
                      )}
                      <p className="text-body mt-2" style={{ color: "var(--fg-secondary)", fontSize: "0.8125rem" }}>
                        {rec.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Percent size={11} style={{ color: "var(--seed-primary)" }} />
                    <span className="text-xs font-[590]" style={{ color: "var(--seed-primary)" }}>
                      {Math.round(rec.confidence * 100)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Export buttons */}
          {recommendations.length > 0 && (
            <div className="flex items-center gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button
                onClick={handleExportJSON}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{ background: "var(--bg-input)", color: "var(--fg-secondary)", border: "1px solid var(--border-default)" }}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                {t("recommend.export_json")}
              </button>
              <button
                onClick={handleExportScreenshot}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{ background: "var(--bg-input)", color: "var(--fg-secondary)", border: "1px solid var(--border-default)" }}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="12" r="4" /></svg>
                {t("recommend.export_screenshot")}
              </button>
              <button
                onClick={() => { setRecommendations([]); setShowChat(false); setChatMessages([]); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ml-auto"
                style={{ color: "var(--fg-muted)" }}
              >
                <Sparkles size={12} />
                {t("recommend.new_session")}
              </button>
            </div>
          )}
        </section>
      )}

      {/* === Recommendation Detail Modal === */}
      <Modal open={detailRec !== null} onClose={() => setDetailRec(null)}
        title={
          <div className="flex items-center gap-2">
            <span className="truncate">{detailRec?.title || ""}</span>
            {detailRec?.media_type === "tv" && (
              <Badge variant="outline" className="text-[10px] text-sky border-sky/30 bg-sky/5 shrink-0">TV</Badge>
            )}
          </div>
        }
        description={detailRec?.year ? `${detailRec.year}${detailRec?.genre ? ` · ${detailRec.genre}` : ""}` : detailRec?.genre || ""}
      >
        {detailRec && (
          <div className="space-y-5">
            {/* Poster + Quick info */}
            <div className="flex gap-5">
              <div className="w-[130px] h-[186px] shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center shadow-md"
                style={{ border: "1px solid var(--border-subtle)" }}>
                {detailRec.poster_url ? (
                  <img src={detailRec.poster_url} alt={detailRec.title} className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <Film size={36} className="text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-[590] mb-1" style={{ color: "var(--seed-fg)" }}>
                    {detailRec.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {detailRec.year && <span className="text-sm text-muted-foreground tabular-nums">{detailRec.year}</span>}
                    {detailRec.genre && <Badge variant="secondary" className="text-[11px]">{detailRec.genre}</Badge>}
                  </div>
                </div>
                {/* Confidence */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-input)" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.round(detailRec.confidence * 100)}%`,
                        background: detailRec.confidence >= 0.8
                          ? "var(--seed-primary)"
                          : detailRec.confidence >= 0.5
                            ? "#f59e0b"
                            : "var(--fg-dim)",
                      }} />
                  </div>
                  <span className="text-xs font-[590] tabular-nums shrink-0" style={{ color: "var(--seed-primary)" }}>
                    {Math.round(detailRec.confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Reason */}
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">{t("recommend.reason_label")}</p>
              <p className="text-sm leading-relaxed">{detailRec.reason}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* === Chat Area — aligns with design === */}
      {showChat && (
        <section className="card overflow-hidden animate-slide-down">
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <MessageSquare size={13} style={{ color: "var(--fg-muted)" }} />
            <span className="text-caption font-[510]">{t("recommend.chat_title")}</span>
          </div>

          <div className="px-4 py-3 max-h-[300px] overflow-y-auto space-y-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 items-start max-w-[90%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
                  style={{ background: msg.role === "user" ? "var(--accent-glow)" : "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>
                  {msg.role === "user" ? "👤" : "🧠"}
                </div>
                <div className="px-3 py-2 rounded-xl text-sm leading-relaxed break-words"
                  style={msg.role === "user"
                    ? { background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }
                    : { background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }
                  }>
                  {msg.content}
                </div>
              </div>
            ))}
            {isChatProcessing && (
              <div className="flex gap-2 items-start max-w-[85%]">
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>🧠</div>
                <div className="px-3 py-2 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                  <span className="text-sm" style={{ color: "var(--fg-muted)" }}>{t("recommend.chat_thinking")}</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <input
              ref={chatInputRef}
              type="text"
              placeholder={t("recommend.chat_placeholder")}
              className="input-field flex-1"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFollowUp(); }}}
            />
            <button
              onClick={sendFollowUp}
              disabled={isChatProcessing}
              className="btn btn-primary w-9 h-9 flex items-center justify-center shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
