import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();

  const handleChange = (value: string) => {
    i18n.changeLanguage(value);
    localStorage.setItem("xplore-lang", value);
  };

  if (compact) {
    const nextLang = i18n.language === "zh-CN" ? "en-US" : "zh-CN";
    const label = nextLang === "zh-CN" ? "🇨🇳" : "🇺🇸";
    return (
      <button
        onClick={() => handleChange(nextLang)}
        className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
        title={nextLang === "zh-CN" ? "Switch to Chinese" : "Switch to English"}
      >
        {label}
      </button>
    );
  }

  return (
    <Select value={i18n.language} onValueChange={handleChange}>
      <SelectTrigger
        size="sm"
        className="h-7 w-[76px] gap-1 px-1.5 text-[11px] font-medium border-0 bg-transparent hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Switch language"
      >
        <Languages size={12} className="shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="zh-CN">
          <span className="flex items-center gap-2">
            <span className="text-sm">🇨🇳</span>
            <span>中文</span>
          </span>
        </SelectItem>
        <SelectItem value="en-US">
          <span className="flex items-center gap-2">
            <span className="text-sm">🇺🇸</span>
            <span>English</span>
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
