import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Sun, Moon, Shuffle } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserMenu } from "./UserMenu";
import { useHistory } from "../context/HistoryContext";
import { useTheme } from "../context/ThemeContext";
import { Logo } from "./Logo";
import { WheelPicker } from "./WheelPicker";

export function Header() {
  const { t } = useTranslation();
  const { setOpen } = useHistory();
  const { theme, toggleTheme } = useTheme();
  const [wheelOpen, setWheelOpen] = useState(false);

  return (
    <header className="flex items-center justify-between py-3 sm:py-4 mb-1 sm:mb-2">
      <div className="flex items-center gap-2 sm:gap-3">
        <Logo />
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => setWheelOpen(true)}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-accent transition-colors active:scale-95"
          aria-label={t("wheel.trigger", "随机选电影")}
          title={t("wheel.trigger", "随机选电影")}
        >
          <Shuffle size={14} />
        </button>
        <button
          onClick={() => setOpen(true)}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-95"
          aria-label={t("history.trigger")}
          title={t("history.trigger")}
        >
          <Clock size={14} />
        </button>
        <LanguageSwitcher />
        <button
          onClick={(e) => toggleTheme(e)}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-95"
          aria-label={theme === "dark" ? t("header.switch_to_light") : t("header.switch_to_dark")}
          title={theme === "dark" ? t("header.switch_to_light") : t("header.switch_to_dark")}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <UserMenu />
      </div>

      <WheelPicker open={wheelOpen} onClose={() => setWheelOpen(false)} />
    </header>
  );
}
