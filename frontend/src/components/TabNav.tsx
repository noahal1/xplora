import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Film, BookmarkPlus, Sparkles, Library, BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { createPortal } from "react-dom";

export function TabNav() {
  const { t } = useTranslation();
  const location = useLocation();

  const tabs = useMemo(() => [
    { id: "watched", label: t("tabs.watched"), icon: Film },
    { id: "wishlist", label: t("tabs.wishlist"), icon: BookmarkPlus },
    { id: "recommend", label: t("tabs.recommend"), icon: Sparkles },
    { id: "stats", label: t("tabs.stats"), icon: BarChart3 },
    { id: "manage", label: t("tabs.manage"), icon: Library },
  ], [t]);

  // Compute active index for sliding indicator
  const activeIndex = tabs.findIndex((tab) => location.pathname === `/${tab.id}`);

  return (
    <>
      {/* ── Top Navigation (hidden on mobile) ──────────────────── */}
      <nav
        className="relative flex items-center gap-1 mb-5 pb-2.5 max-sm:hidden border-b border-border-subtle"
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
              <Icon size={14} key={String(isActive)} className={isActive ? "animate-tab-icon-bounce" : ""} />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* ── Bottom Tab Bar (mobile only, portal to body) ──────── */}
      {createPortal(
        <nav
          className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around py-1.5 px-1 animate-bottom-nav-enter"
          style={{
            background: "var(--seed-bg)",
            borderTop: "1px solid var(--border-default)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.375rem)",
          }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === `/${tab.id}`;
            return (
              <NavLink
                key={tab.id}
                to={`/${tab.id}`}
                className={`flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-lg transition-all flex-1 min-w-0 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground/60 hover:text-muted-foreground active:scale-95"
                }`}
              >
                <Icon size={18} key={String(isActive)} className={isActive ? "animate-tab-icon-bounce" : ""} />
                <span className="text-[10px] font-medium leading-tight truncate max-w-full">
                  {tab.label}
                </span>
              </NavLink>
            );
          })}
        </nav>,
        document.body
      )}
    </>
  );
}
