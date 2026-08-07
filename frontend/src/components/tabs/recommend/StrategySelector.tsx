import { useMemo, useState } from "react";
import { Star, Sparkles, Check, ListTodo } from "lucide-react";
import type { TFunction } from "i18next";
import { STRATEGIES } from "./strategies";
import { MODEL_ORDER, MODEL_CATALOG, DEFAULT_MODELS, getModelShortLabel } from "../../../lib/models";
import { MediaTypeFilter } from "../../MediaTypeFilter";
import { GenreFilter } from "../../GenreFilter";
import { SearchInput } from "../../SearchInput";
import { VirtualList } from "../../VirtualList";
import type { Playlist } from "../../../types";

interface StrategySelectorProps {
  strategy: string;
  onStrategyChange: (id: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  /** Model ids that are available (configured AI keys + always-available local models). */
  availableModels?: string[];
  recCount: number;
  onRecCountChange: (n: number) => void;
  strategyMood: string;
  onMoodChange: (v: string) => void;
  strategyPlaylistId: string;
  onPlaylistChange: (id: string) => void;
  playlists: Playlist[];
  mediaTypeFilter: string;
  onMediaTypeFilterChange: (v: string) => void;
  genreFilter: Set<string>;
  onGenreFilterChange: (v: Set<string>) => void;
  uniqueGenres: string[];
  filteredCount: number;
  onGenerate: () => void;
  t: TFunction;
}

export function StrategySelector({
  strategy, onStrategyChange,
  selectedModel, onModelChange, availableModels,
  recCount, onRecCountChange,
  strategyMood, onMoodChange,
  strategyPlaylistId, onPlaylistChange,
  playlists,
  mediaTypeFilter, onMediaTypeFilterChange,
  genreFilter, onGenreFilterChange,
  uniqueGenres,
  filteredCount,
  onGenerate,
  t,
}: StrategySelectorProps) {
  const [playlistQuery, setPlaylistQuery] = useState("");

  // Filter playlists by name/description for the picker search
  const filteredPlaylists = useMemo(() => {
    const q = playlistQuery.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [playlists, playlistQuery]);

  return (
    <div className="flex flex-col items-center py-6 sm:py-10 px-3 sm:px-4">
      {/* Sparkle icon */}
      <div
        className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex items-center justify-center mb-3 sm:mb-4"
        style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}
      >
        <Sparkles size={16} className="text-primary" />
      </div>
      <h2 className="text-sm sm:text-heading mb-1.5 sm:mb-2 text-center text-foreground">
        {t("recommend.empty_title")}
      </h2>
      <p className="text-xs sm:text-body text-center max-w-md mb-4 sm:mb-6 text-muted-foreground">
        {t("recommend.empty_desc")}
      </p>

      {/* ── Strategy Selector Grid ────────────────────────── */}
      <div className="w-full max-w-[520px] mb-4 sm:mb-6">
        <p className="text-label mb-2 sm:mb-3 text-center text-fg-dim">
          {t("recommend.strategy_label")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
          {STRATEGIES.map((s) => {
            const Icon = s.icon;
            const isActive = strategy === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onStrategyChange(s.id)}
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

      <MediaTypeFilter
        selected={mediaTypeFilter}
        onSelect={onMediaTypeFilterChange}
        className="justify-start sm:justify-center"
      />

      {/* ── Genre Filter ─────────────────────────────── */}
      <GenreFilter
        genres={uniqueGenres}
        selected={genreFilter}
        onSelect={onGenreFilterChange}
      />

      {/* ── Strategy-specific inputs ──────────────────────── */}
      {strategy === "mood" && (
        <div className="w-full max-w-[400px] mb-5">
          <input
            type="text"
            value={strategyMood}
            onChange={(e) => onMoodChange(e.target.value)}
            placeholder={t("recommend.strategy_mood_placeholder")}
            className="input-field text-center"
          />
        </div>
      )}

      {strategy === "playlist" && (
        <div className="w-full max-w-[520px] mb-5">
          <p className="text-label mb-2 sm:mb-3 text-center text-fg-dim">
            {t("recommend.strategy_playlist_placeholder")}
          </p>
          {playlists.length === 0 ? (
            <div className="text-center py-6 rounded-lg border border-dashed border-border bg-muted/20">
              <p className="text-sm text-foreground">{t("playlists.no_playlists")}</p>
              <p className="text-xs mt-0.5 text-muted-foreground">{t("playlists.no_playlists_hint")}</p>
            </div>
          ) : (
            <>
              {/* Search box */}
              <div className="mb-2">
                <SearchInput
                  value={playlistQuery}
                  onChange={setPlaylistQuery}
                  onClear={() => setPlaylistQuery("")}
                  placeholder={t("playlists.search_playlists_placeholder")}
                />
              </div>

              {filteredPlaylists.length === 0 ? (
                <div className="text-center py-6 rounded-lg border border-dashed border-border bg-muted/20">
                  <p className="text-sm text-foreground">{t("playlists.search_playlists_empty")}</p>
                </div>
              ) : (
                <VirtualList
                  items={filteredPlaylists}
                  rowHeight={64}
                  maxHeight="260px"
                  overscan={6}
                  className="rounded-lg pr-1"
                  keyFn={(p) => `pl-${p.id}`}
                  renderRow={(p) => {
                    const isSelected = String(p.id) === strategyPlaylistId;
                    return (
                      <button
                        onClick={() => onPlaylistChange(String(p.id))}
                        className="w-full h-[calc(100%-4px)] mb-1 flex items-center gap-2.5 p-2 rounded-lg text-left transition-all"
                        style={{
                          background: isSelected ? "var(--accent-glow)" : "var(--bg-input)",
                          border: isSelected
                            ? "1px solid var(--primary-30)"
                            : "1px solid var(--border-subtle)",
                        }}
                      >
                        {/* Cover thumbnail */}
                        <div className="w-8 h-11 rounded overflow-hidden shrink-0 border border-border-subtle">
                          {p.cover_url ? (
                            <img
                              src={p.cover_url}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ background: "linear-gradient(135deg, var(--primary-20), transparent)" }}
                            >
                              <ListTodo size={12} className="text-primary/70" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs truncate"
                            style={{ fontWeight: isSelected ? 590 : 510, color: isSelected ? "var(--seed-accent)" : "var(--fg-secondary)" }}
                          >
                            {p.name}
                          </p>
                          <p className="text-[10px] mt-0.5 text-muted-foreground">
                            {t("playlists.item_count", { count: p.item_count ?? 0 })}
                          </p>
                        </div>
                        {isSelected && (
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: "var(--seed-primary)", color: "#0f0f0f" }}
                          >
                            <Check size={10} strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  }}
                />
              )}
            </>
          )}
          <p className="text-caption text-fg-dim text-center mt-2">
            {t("recommend.strategy_playlist_hint")}
          </p>
        </div>
      )}

      {/* ── Model + Count + Generate ─────────────────────── */}
      <div className="flex flex-col items-center gap-4 mb-2">
        {/* Model toggle */}
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-lg p-0.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>
          {(availableModels ?? MODEL_ORDER.filter((m) => DEFAULT_MODELS.includes(m))).map((modelId) => {
            const meta = MODEL_CATALOG[modelId];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <button
                key={modelId}
                onClick={() => onModelChange(modelId)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                style={
                  selectedModel === modelId
                    ? { background: "var(--seed-primary)", color: "#0f0f0f" }
                    : { color: "var(--fg-muted)" }
                }
              >
                <Icon size={13} />
                <span>{getModelShortLabel(modelId)}</span>
              </button>
            );
          })}
        </div>

        {/* Count */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-dim">{t("recommend.rec_count")}</span>
          <div className="flex items-center gap-1">
            <button
              className="w-6 h-6 flex items-center justify-center rounded text-xs font-medium transition-all disabled:opacity-30"
              style={{ border: "1px solid var(--border-subtle)", color: "var(--fg-muted)" }}
              disabled={recCount <= 1}
              onClick={() => onRecCountChange(Math.max(1, recCount - 1))}
            >−</button>
            <span className="w-6 text-center text-xs font-semibold text-primary">{recCount}</span>
            <button
              className="w-6 h-6 flex items-center justify-center rounded text-xs font-medium transition-all disabled:opacity-30"
              style={{ border: "1px solid var(--border-subtle)", color: "var(--fg-muted)" }}
              disabled={recCount >= 20}
              onClick={() => onRecCountChange(Math.min(20, recCount + 1))}
            >+</button>
          </div>
        </div>

        {/* Generate button */}
        {filteredCount < 2 && (
          <p className="text-sm text-muted-foreground">
            {mediaTypeFilter !== "all"
              ? t("recommend.need_more_filtered", { type: t(`manage.media_type_${mediaTypeFilter}`) })
              : t("recommend.need_more_movies")}
          </p>
        )}
        {strategy === "playlist" && !strategyPlaylistId && filteredCount >= 2 && (
          <p className="text-sm text-muted-foreground">{t("recommend.strategy_playlist_required")}</p>
        )}

        <button
          onClick={onGenerate}
          disabled={filteredCount < 2 || (strategy === "playlist" && !strategyPlaylistId)}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
          style={{
            background: filteredCount >= 2 && !(strategy === "playlist" && !strategyPlaylistId) ? "var(--seed-primary)" : "var(--bg-input)",
            color: filteredCount >= 2 && !(strategy === "playlist" && !strategyPlaylistId) ? "#0f0f0f" : "var(--fg-dim)",
            border: filteredCount >= 2 && !(strategy === "playlist" && !strategyPlaylistId) ? "none" : "1px solid var(--border-default)",
          }}
        >
          <Sparkles size={14} />
          {t("recommend.generate")}
        </button>

        <p className="text-caption text-fg-dim">
          {t("recommend.based_on", { count: filteredCount })} · Ctrl+Enter
        </p>
      </div>
    </div>
  );
}
