import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserMenu } from "./UserMenu";
import { useHistory } from "../context/HistoryContext";
import { Logo } from "./Logo";

export function Header() {
  const { t } = useTranslation();
  const { setOpen } = useHistory();

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
        <UserMenu />
      </div>
    </header>
  );
}
