import { Brain, Bot, Gem, Cpu, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Icon-only badge for a model id (module-level component, safe for JSX). */
export function ModelIcon({ model, size = 14, className }: { model: string; size?: number; className?: string }) {
  const Icon = MODEL_CATALOG[model]?.icon ?? Bot;
  return <Icon size={size} className={className} />;
}

/** Icon + label badge for a model id (used in history/detail views). */
export function ModelBadge({ model, size = 14 }: { model: string; size?: number }) {
  const Icon = MODEL_CATALOG[model]?.icon ?? Bot;
  return (
    <>
      <Icon size={size} className="inline mr-0.5" />
      {getModelLabel(model)}
    </>
  );
}

/**
 * AI model catalog shared across the recommend selector, history
 * components and any place that displays a model name.
 *
 * ``id`` values must match the backend ``MODEL_CONFIGS`` keys, plus the
 * special ``local`` id (TMDB-only recommendations, no AI key needed).
 */
export const MODEL_CATALOG: Record<string, { label: string; short: string; icon: LucideIcon; local?: boolean }> = {
  deepseek: { label: "DeepSeek", short: "DeepSeek", icon: Brain },
  openai: { label: "OpenAI (GPT-4o)", short: "GPT-4o", icon: Bot },
  claude: { label: "Claude (Sonnet)", short: "Claude", icon: Bot },
  gemini: { label: "Gemini (2.0 Flash)", short: "Gemini", icon: Gem },
  zhipu: { label: "Zhipu GLM-4-Flash (Free)", short: "GLM", icon: Zap },
  ollama: { label: "Ollama (Local)", short: "Ollama", icon: Cpu, local: true },
  local: { label: "Local (TMDB)", short: "本地推荐", icon: Sparkles, local: true },
};

/** Model ids in display order (frontend selector). */
export const MODEL_ORDER = ["deepseek", "openai", "claude", "gemini", "zhipu", "ollama", "local"];

/**
 * Models shown in the selector before /health has loaded. Keep in sync
 * with the backend's auto-pick order (free/remote models + local ones).
 */
export const DEFAULT_MODELS = ["deepseek", "openai", "zhipu", "local"];

/** True when the model id is in the pre-health default list. */
export function isDefaultModel(model: string): boolean {
  return DEFAULT_MODELS.includes(model);
}

/** Return the display label for a model id (falls back to the raw id). */
export function getModelLabel(model: string): string {
  return MODEL_CATALOG[model]?.label ?? model;
}

/** Return the short label used in compact badges. */
export function getModelShortLabel(model: string): string {
  return MODEL_CATALOG[model]?.short ?? model;
}

/** Return the icon component for a model id. */
export function getModelIcon(model: string): LucideIcon {
  return MODEL_CATALOG[model]?.icon ?? Bot;
}

/** True when the model needs no remote AI key (ollama / local TMDB). */
export function isLocalModel(model: string): boolean {
  return !!MODEL_CATALOG[model]?.local;
}
