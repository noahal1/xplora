import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Film, BookmarkPlus, Sparkles, Library, History } from "lucide-react";
import { useMemo } from "react";

export function TabNav() {
  const { t } = useTranslation();
  const location = useLocation();

  const tabs = useMemo(() => [
    { id: "watched", label: t("tabs.watched"), icon: Film },
    { id: "wishlist", label: t("tabs.wishlist"), icon: BookmarkPlus },
    { id: "recommend", label: t("tabs.recommend"), icon: Sparkles },
    { id: "manage", label: t("tabs.manage"), icon: Library },
    { id: "history", label: t("tabs.history"), icon: History },
  ], [t]);

  // Compute active index for sliding indicator
  const activeIndex = tabs.findIndex((tab) => location.pathname === `/${tab.id}`);

  return (
    <nav
      className="relative flex items-center gap-1 mb-6 pb-3"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      {/* Sliding indicator */}
      {activeIndex >= 0 && (
        <div
          className="absolute bottom-0 h-[2px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            background: "var(--seed-primary)",
            width: `${100 / tabs.length}%`,
            left: `${(activeIndex / tabs.length) * 100}%`,
          }}
        />
      )}

      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = location.pathname === `/${tab.id}`;
        return (
          <NavLink
            key={tab.id}
            to={`/${tab.id}`}
            className={`tab-item flex items-center gap-1.5 flex-1 justify-center ${
              isActive ? "active" : ""
            }`}
          >
            <Icon size={14} />
            <span>{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
