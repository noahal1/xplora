import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Shuffle, Server } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserMenu } from "./UserMenu";
import { useTheme } from "../context/ThemeContext";
import { Logo } from "./Logo";
import { WheelPicker } from "./WheelPicker";
import { Modal } from "./Modal";
import { MediaServerTab } from "./MediaServerTab";

export function Header() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [wheelOpen, setWheelOpen] = useState(false);
  const [showMediaServer, setShowMediaServer] = useState(false);

  return (
    <header className="flex items-center justify-between py-3 sm:py-4 mb-1 sm:mb-2 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pt-[calc(1rem+env(safe-area-inset-top,0px))]">
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
          onClick={() => setShowMediaServer(true)}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-accent transition-colors active:scale-95"
          aria-label={t("media_server.tab_title")}
          title={t("media_server.tab_title")}
        >
          <Server size={14} />
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

      <Modal
        open={showMediaServer}
        onClose={() => setShowMediaServer(false)}
        title={t("media_server.title")}
        size="lg"
      >
        <MediaServerTab />
      </Modal>
    </header>
  );
}
