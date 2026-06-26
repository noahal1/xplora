import { Star, Brain, Bot, Sparkles } from "lucide-react";
import type { TFunction } from "i18next";
import { STRATEGIES } from "./strategies";
import { MediaTypeFilter } from "../../MediaTypeFilter";
import { GenreFilter } from "../../GenreFilter";

const VISIBLE_GENRES = 6;

interface StrategySelectorProps {
  strategy: string;
  onStrategyChange: (id: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  recCount: number;
  onRecCountChange: (n: number) => void;
  strategyMood: string;
  onMoodChange: (v: string) => void;
  strategyYearStart: string;
  onYearStartChange: (v: string) => void;
  strategyYearEnd: string;
  onYearEndChange: (v: string) => void;
  mediaTypeFilter: string;
  onMediaTypeFilterChange: (v: string) => void;
  genreFilter: string;
  onGenreFilterChange: (v: string) => void;
  uniqueGenres: string[];
  filteredCount: number;
  onGenerate: () => void;
  t: TFunction;
}

export function StrategySelector({
  strategy, onStrategyChange,
  selectedModel, onModelChange,
  recCount, onRecCountChange,
  strategyMood, onMoodChange,
  strategyYearStart, onYearStartChange,
  strategyYearEnd, onYearEndChange,
  mediaTypeFilter, onMediaTypeFilterChange,
  genreFilter, onGenreFilterChange,
  uniqueGenres,
  filteredCount,
  onGenerate,
  t,
}: StrategySelectorProps) {
  return (
    <div className="flex flex-col items-center py-6 sm:py-10 px-3 sm:px-4">
      {/* Sparkle icon */}
      <div
        className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex items-center justify-center mb-3 sm:mb-4"
        style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}
      >
        <Sparkles size={16} style={{ color: "var(--seed-primary)" }} />
      </div>
      <h2 className="text-sm sm:text-heading mb-1.5 sm:mb-2 text-center" style={{ color: "var(--seed-fg)" }}>
        {t("recommend.empty_title")}
      </h2>
      <p className="text-xs sm:text-body text-center max-w-md mb-4 sm:mb-6" style={{ color: "var(--fg-muted)" }}>
        {t("recommend.empty_desc")}
      </p>

      {/* ── Strategy Selector Grid ────────────────────────── */}
      <div className="w-full max-w-[520px] mb-4 sm:mb-6">
        <p className="text-label mb-2 sm:mb-3 text-center" style={{ color: "var(--fg-dim)" }}>
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
        visibleCount={VISIBLE_GENRES}
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

      {strategy === "era" && (
        <div className="w-full max-w-[320px] mb-5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={strategyYearStart}
              onChange={(e) => onYearStartChange(e.target.value)}
              placeholder={t("recommend.strategy_era_start")}
              className="input-field text-center"
              min={1900}
              max={2030}
            />
            <span className="text-xs" style={{ color: "var(--fg-dim)" }}>—</span>
            <input
              type="number"
              value={strategyYearEnd}
              onChange={(e) => onYearEndChange(e.target.value)}
              placeholder={t("recommend.strategy_era_end")}
              className="input-field text-center"
              min={1900}
              max={2030}
            />
          </div>
        </div>
      )}

      {/* ── Model + Count + Generate ─────────────────────── */}
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
                onClick={() => onModelChange(opt.value)}
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
              onClick={() => onRecCountChange(Math.max(1, recCount - 1))}
            >−</button>
            <span className="w-6 text-center text-xs font-semibold" style={{ color: "var(--seed-primary)" }}>{recCount}</span>
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
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {mediaTypeFilter !== "all"
              ? t("recommend.need_more_filtered", { type: t(`manage.media_type_${mediaTypeFilter}`) })
              : t("recommend.need_more_movies")}
          </p>
        )}

        <button
          onClick={onGenerate}
          disabled={filteredCount < 2}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
          style={{
            background: filteredCount >= 2 ? "var(--seed-primary)" : "var(--bg-input)",
            color: filteredCount >= 2 ? "#0f0f0f" : "var(--fg-dim)",
            border: filteredCount >= 2 ? "none" : "1px solid var(--border-default)",
          }}
        >
          <Sparkles size={14} />
          {t("recommend.generate")}
        </button>

        <p className="text-caption" style={{ color: "var(--fg-dim)" }}>
          {t("recommend.based_on", { count: filteredCount })} · Ctrl+Enter
        </p>
      </div>
    </div>
  );
}
