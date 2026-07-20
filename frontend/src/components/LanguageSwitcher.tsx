import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang = i18n.language;
  const nextLang = currentLang === "zh-CN" ? "en-US" : "zh-CN";
  const label = nextLang === "zh-CN" ? "Switch to Chinese" : "Switch to English";
  // Show shorter text labels on mobile too — flags render inconsistently across
  // platforms (some show emoji, others show letter abbreviations).
  const currentLabel = currentLang === "zh-CN" ? "中" : "EN";

  const handleToggle = () => {
    i18n.changeLanguage(nextLang);
    localStorage.setItem("xplora-lang", nextLang);
  };

  return (
    <button
      onClick={handleToggle}
      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-xs font-semibold tracking-wide text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-95"
      aria-label={label}
      title={label}
    >
      {currentLabel}
    </button>
  );
}
