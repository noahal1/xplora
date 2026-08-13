import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Film, BookmarkPlus, Sparkles, Library, BarChart3, Compass } from "lucide-react";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import GooeyNav, { type GooeyNavItem } from "./GooeyNav";

export function TabNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = useMemo(() => [
    { id: "watched", label: t("tabs.watched"), icon: Film },
    { id: "wishlist", label: t("tabs.wishlist"), icon: BookmarkPlus },
    { id: "discover", label: t("tabs.discover"), icon: Compass },
    { id: "recommend", label: t("tabs.recommend"), icon: Sparkles },
    { id: "stats", label: t("tabs.stats"), icon: BarChart3 },
    { id: "manage", label: t("tabs.manage"), icon: Library },
  ], [t]);

  // Router is the single source of truth for the active tab (-1 = no tab matched)
  const activeIndex = tabs.findIndex((tab) => location.pathname === `/${tab.id}`);

  // Build GooeyNav items with per-item active icon (bounce on activation)
  const gooeyItems = useMemo<GooeyNavItem[]>(
    () =>
      tabs.map((tab, i) => {
        const Icon = tab.icon;
        const isActive = i === activeIndex;
        return {
          label: tab.label,
          href: `/${tab.id}`,
          icon: (
            <Icon size={14} key={String(isActive)} className={isActive ? "animate-tab-icon-bounce" : ""} />
          ),
        };
      }),
    [tabs, activeIndex]
  );

  return (
    <>
      {/* ── Top Navigation (hidden on mobile) ──────────────────── */}
      <div className="max-sm:hidden mb-5 pb-3 border-b border-border-subtle">
        <GooeyNav
          items={gooeyItems}
          activeIndex={activeIndex}
          onSelect={(i) => {
            const tab = tabs[i];
            if (tab) navigate(`/${tab.id}`);
          }}
          particleCount={10}
          particleDistances={[56, 12]}
          particleR={50}
          timeVariance={220}
        />
      </div>

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
