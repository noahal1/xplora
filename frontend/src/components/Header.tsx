import { useTranslation } from "react-i18next";
import { Clock, Sun, Moon } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserMenu } from "./UserMenu";
import { useHistory } from "../context/HistoryContext";
import { useTheme } from "../context/ThemeContext";
import { Logo } from "./Logo";

export function Header() {
  const { t } = useTranslation();
  const { setOpen } = useHistory();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center justify-between py-4 mb-2">
      <div className="flex items-center gap-3">
        <Logo />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={t("history.trigger")}
          title={t("history.trigger")}
        >
          <Clock size={16} />
        </button>
        <LanguageSwitcher />
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={theme === "dark" ? t("header.switch_to_light") : t("header.switch_to_dark")}
          title={theme === "dark" ? t("header.switch_to_light") : t("header.switch_to_dark")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
