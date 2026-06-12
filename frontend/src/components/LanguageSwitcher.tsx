import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang = i18n.language;
  const nextLang = currentLang === "zh-CN" ? "en-US" : "zh-CN";
  const flag = currentLang === "zh-CN" ? "🇨🇳" : "🇺🇸";
  const label = nextLang === "zh-CN" ? "Switch to Chinese" : "Switch to English";

  const handleToggle = () => {
    i18n.changeLanguage(nextLang);
    localStorage.setItem("xplora-lang", nextLang);
  };

  return (
    <button
      onClick={handleToggle}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label={label}
      title={label}
    >
      <span className="text-sm leading-none">{flag}</span>
    </button>
  );
}
