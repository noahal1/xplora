import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  User,
  Shield,
  Settings,
  LogOut,
  ChevronDown,
} from "lucide-react";

export function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate("/login");
  };

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-1 sm:py-1.5 transition-all hover:bg-accent active:scale-95"
        aria-label={t("header.profile")}
        aria-expanded={open}
      >
        <div
          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-default)",
          }}
        >
          {user?.username ? (
            <span className="text-[10px] font-semibold" style={{ color: "var(--fg-muted)" }}>
              {user.username.charAt(0).toUpperCase()}
            </span>
          ) : (
            <User size={13} style={{ color: "var(--fg-muted)" }} />
          )}
        </div>
        <ChevronDown
          size={12}
          className="text-muted-foreground transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border shadow-2xl animate-menu-slide overflow-hidden z-50"
          style={{
            background: "var(--bg-elevated)",
            borderColor: "var(--border-default)",
            boxShadow: "0 16px 48px -12px rgba(0,0,0,0.6), 0 0 0 1px var(--primary-10)",
          }}
        >
          {/* User info header */}
          <div className="px-3.5 py-3 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
              style={{
                background: user?.is_admin ? "var(--accent-glow)" : "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                color: user?.is_admin ? "var(--seed-primary)" : "var(--fg-secondary)",
              }}
            >
              {user?.username?.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.username || "—"}</p>
              <span
                className="text-[10px] font-medium"
                style={{ color: user?.is_admin ? "var(--seed-primary)" : "var(--fg-muted)" }}
              >
                {user?.is_admin ? t("profile.admin") : t("profile.user")}
              </span>
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--border-subtle)" }} />

          {/* Menu items */}
          <div className="py-1">
            {/* Profile settings */}
            <MenuItem
              icon={<Settings size={14} />}
              label={t("profile.title")}
              onClick={() => handleNavigate("/profile")}
            />

            {/* Admin panel (admin only) */}
            {user?.is_admin && (
              <MenuItem
                icon={<Shield size={14} />}
                label={t("admin.title")}
                onClick={() => handleNavigate("/admin")}
              />
            )}
          </div>

          <div style={{ height: "1px", background: "var(--border-subtle)" }} />

          {/* Logout */}
          <div className="py-1">
            <MenuItem
              icon={<LogOut size={14} />}
              label={t("profile.logout")}
              danger
              onClick={handleLogout}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Menu item sub-component ─────────────────────────── */

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors"
      style={{
        color: danger ? "var(--destructive)" : "var(--fg-secondary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? "rgba(220, 38, 38, 0.08)"
          : "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
