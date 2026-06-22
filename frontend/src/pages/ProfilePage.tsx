import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { changePassword, checkUpdate } from "../api";
import { useToast } from "../context/ToastContext";
import { UpdateModal } from "../components/UpdateModal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { useNavigate } from "react-router-dom";
import { useEnrich } from "../context/EnrichContext";
import FadeContent from "../components/FadeContent";
import { CheckCircle, XCircle, Moon, Sun } from "lucide-react";

interface HealthStatus {
  status: string;
  version: string;
  database: string;
  database_status: string;
  api_keys: Record<string, boolean>;
}

interface UpdateInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  release_notes: string | null;
  published_at: string | null;
  error: string | null;
}

const API_KEY_META: Record<string, { label: string; docs: string; placeholder: string }> = {
  deepseek: { label: "DeepSeek AI", docs: "https://platform.deepseek.com/", placeholder: "sk-" },
  openai: { label: "OpenAI", docs: "https://platform.openai.com/", placeholder: "sk-proj-" },
  tmdb: { label: "TMDB", docs: "https://www.themoviedb.org/settings/api", placeholder: "" },
};

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();
  const navigate = useNavigate();

  // === Password state ===
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  // === Health / API key status ===
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");

  // === Update check ===
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);

  // === API key editing ===
  const [editKeys, setEditKeys] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState(false);
  const [keyConfigOpen, setKeyConfigOpen] = useState(false);

  // Populate editKeys when health loads
  useEffect(() => {
    if (health?.api_keys) {
      setEditKeys((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const initial: Record<string, string> = {};
        for (const key of Object.keys(API_KEY_META)) {
          initial[key] = "";
        }
        return initial;
      });
    }
  }, [health]);

  const handleSaveKeys = async () => {
    setSavingKeys(true);
    try {
      const token = localStorage.getItem("xplora-token");
      // Only send non-empty keys — don't overwrite other keys with empty strings
      const filledKeys: Record<string, string> = {};
      for (const [key, val] of Object.entries(editKeys)) {
        if (val.trim()) {
          filledKeys[key] = val.trim();
        }
      }
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ api_keys: filledKeys }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: t("profile.api_save_failed", { message: "" }) }));
        throw new Error(err.detail || t("profile.api_save_failed", { message: "" }));
      }
      const data = await res.json();
      setHealth((prev) => prev ? { ...prev, api_keys: data.api_keys } : prev);
      setKeyConfigOpen(false);
      showToast(t("profile.api_saved"), "success");
    } catch (err: any) {
      showToast(t("profile.api_save_failed", { message: err.message }), "error");
    } finally {
      setSavingKeys(false);
    }
  };

  // === Export ===
  const [exporting, setExporting] = useState(false);

  // === Import ===
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>("");
  const [importSuccess, setImportSuccess] = useState(false);

  // Fetch health on mount
  useEffect(() => {
    const fetchHealth = async () => {
      setHealthLoading(true);
      setHealthError("");
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error(t("profile.health_failed"));
        const data = await res.json();
        setHealth(data);
      } catch (err: any) {
        setHealthError(err.message);
      } finally {
        setHealthLoading(false);
      }
    };
    fetchHealth();
  }, [t]);

  // ================================
  // Password
  // ================================

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPwError(t("profile.password_empty"));
      return;
    }
    if (newPassword.length < 4) {
      setPwError(t("profile.password_too_short"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t("profile.password_mismatch"));
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPwSuccess(t("profile.password_success"));
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(t("profile.password_success"), "success");
    } catch (err: any) {
      setPwError(err.message);
    } finally {
      setPwLoading(false);
    }
  };

  // ================================
  // Export
  // ================================

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem("xplora-token");
      const res = await fetch("/api/user/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: t("profile.export_failed", { message: "" }) }));
        throw new Error(err.detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xplora-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t("profile.export_success"), "success");
    } catch (err: any) {
      showToast(t("profile.export_failed", { message: err.message }), "error");
    } finally {
      setExporting(false);
    }
  }, [showToast, t]);

  // ================================
  // Import
  // ================================

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      showToast(t("profile.import_select_json"), "error");
      e.target.value = "";
      return;
    }

    setImporting(true);
    setImportResult("");
    setImportSuccess(false);
    try {
      const token = localStorage.getItem("xplora-token");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/user/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: t("profile.import_failed", { message: "" }) }));
        throw new Error(err.detail);
      }

      const data = await res.json();
      const typeLabel = data.status_type === "wish" ? t("profile.import_wish") : t("profile.import_watched");
      setImportResult(t("profile.import_success", { count: data.count, type: typeLabel }));
      setImportSuccess(true);
      showToast(t("profile.import_success", { count: data.count, type: typeLabel }), "success");
      // Start polling for background metadata enrichment
      startPolling();
    } catch (err: any) {
      setImportResult(t("profile.import_failed", { message: err.message }));
      setImportSuccess(false);
      showToast(t("profile.import_failed", { message: err.message }), "error");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }, [showToast, t]);

  // ================================
  // Logout
  // ================================

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // ================================
  // Render
  // ================================

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-5 py-10 space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
        </svg>
        {t("profile.back_home")}
      </button>

      {/* ======================== */}
      {/* 1. Profile Section */}
      {/* ======================== */}
      <FadeContent className="section-card">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-xl font-semibold text-foreground shrink-0">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{user?.username}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={user?.is_admin ? "default" : "secondary"} className="text-[10px]">
                {user?.is_admin ? t("profile.admin") : t("profile.user")}
              </Badge>
              {health && (
                <span className="text-[10px] text-muted-foreground">{health.version}</span>
              )}
            </div>
          </div>
        </div>
      </FadeContent>

      {/* ======================== */}
      {/* 2. Theme Section */}
      {/* ======================== */}
      <FadeContent className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              {theme === "dark" ? (
                <>
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </>
              ) : (
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              )}
            </svg>
            {t("profile.theme")}
          </h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{theme === "dark" ? t("profile.dark_mode") : t("profile.light_mode")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {theme === "dark" ? t("profile.dark_hint") : t("profile.light_hint")}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                theme === "dark" ? "translate-x-6" : "translate-x-0.5"
              } flex items-center justify-center text-[9px]`}
            >
              {theme === "dark" ? <Moon size={9} /> : <Sun size={9} />}
            </span>
          </button>
        </div>
      </FadeContent>

      {/* ======================== */}
      {/* 3. API Key Status Section */}
      {/* ======================== */}
      <FadeContent className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {t("profile.api_status")}
          </h2>
          <div className="flex items-center gap-2">
            {healthLoading && (
              <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            )}
            {user?.is_admin && (
              <button
                onClick={() => setKeyConfigOpen(!keyConfigOpen)}
                className="text-[11px] text-primary hover:underline"
              >
                {keyConfigOpen ? t("profile.api_cancel") : t("profile.api_configure")}
              </button>
            )}
          </div>
        </div>

        {healthError && (
          <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs mb-3">
            {healthError}
          </div>
        )}

        {health && (
          <div className="space-y-2">
            {Object.entries(API_KEY_META).map(([key, { label, docs, placeholder }]) => {
              const configured = health.api_keys?.[key];
              const isEditing = keyConfigOpen;
              return (
                <div key={key} className="py-1.5 px-3 rounded-lg bg-muted/30">
                  {isEditing && user?.is_admin ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="block text-[11px] text-muted-foreground mb-0.5">
                          {label}
                        </label>
                        <input
                          type="password"
                          value={editKeys[key] ?? ""}
                          onChange={(e) => setEditKeys((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={`${label} API Key${placeholder ? ` (${placeholder}...)` : ""}`}
                          className="w-full h-8 px-2.5 rounded-md border border-input bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-ring focus:ring-[2px] focus:ring-ring/20 font-mono"
                        />
                      </div>
                      <a
                        href={docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[10px] text-primary hover:underline mt-4"
                      >
                        {t("profile.api_get_key")}
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${configured ? "bg-green" : "bg-muted-foreground/30"}`} />
                        <span className="text-sm">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] ${configured ? "text-green" : "text-muted-foreground"}`}>
                          {configured ? t("profile.api_configured") : t("profile.api_not_configured")}
                        </span>
                        {!configured && (
                          <a href={docs} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline">
                            {t("profile.api_get")}
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {keyConfigOpen && user?.is_admin && (
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
            <button
              onClick={() => {
                setKeyConfigOpen(false);
                const initial: Record<string, string> = {};
                for (const k of Object.keys(API_KEY_META)) initial[k] = "";
                setEditKeys(initial);
              }}
              className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {t("profile.api_cancel")}
            </button>
            <button
              onClick={handleSaveKeys}
              disabled={savingKeys}
              className="h-8 px-4 rounded-lg text-xs font-medium bg-foreground text-background transition-all hover:opacity-90 disabled:opacity-50"
            >
              {savingKeys ? t("profile.api_saving") : t("profile.api_save")}
            </button>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground mt-3">
          {keyConfigOpen ? t("profile.api_hint_edit") : t("profile.api_hint_view")}
        </p>
      </FadeContent>

      {/* ======================== */}
      {/* 4. Password Section */}
      {/* ======================== */}
      <FadeContent className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {t("profile.change_password")}
          </h2>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="old-password" className="block text-xs font-medium text-muted-foreground">{t("profile.current_password")}</label>
            <input id="old-password" type="password" value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full h-12 sm:h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20" />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor="new-password" className="block text-xs font-medium text-muted-foreground">{t("profile.new_password")}</label>
              <input id="new-password" type="password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full h-12 sm:h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20" />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="confirm-password" className="block text-xs font-medium text-muted-foreground">{t("profile.confirm_password")}</label>
              <input id="confirm-password" type="password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full h-12 sm:h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20" />
            </div>
          </div>

          {pwError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-emerald-500 bg-emerald-500/10 rounded-lg px-3 py-2">{pwSuccess}</p>}

          <Button type="submit" disabled={pwLoading} size="sm" className="w-full">
            {pwLoading ? t("profile.password_changing") : t("profile.change_password")}
          </Button>
        </form>
      </FadeContent>

      {/* ======================== */}
      {/* 5. Data Section */}
      {/* ======================== */}
      <FadeContent className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t("profile.data_management")}
          </h2>
        </div>

        <div className="space-y-3">
          {/* Export */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("profile.export_data")}</p>
              <p className="text-xs text-muted-foreground">{t("profile.export_desc")}</p>
            </div>
            <Button variant="secondary" size="sm" disabled={exporting} onClick={handleExport}>
              {exporting ? (
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                  {t("profile.exporting")}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {t("profile.export")}
                </span>
              )}
            </Button>
          </div>

          <Separator />

          {/* Import */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("profile.import_data")}</p>
              <p className="text-xs text-muted-foreground">{t("profile.import_desc")}</p>
            </div>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={importing}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Button variant="outline" size="sm" disabled={importing}>
                {importing ? (
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                    {t("profile.importing")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {t("profile.import")}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {importResult && (
            <p className={`text-xs rounded-lg px-3 py-2 flex items-center gap-1.5 ${
              importSuccess
                ? "text-emerald-500 bg-emerald-500/10"
                : "text-destructive bg-destructive/10"
            }`}>
              {importSuccess ? <CheckCircle size={12} /> : <XCircle size={12} />}
              {importResult}
            </p>
          )}
        </div>
      </FadeContent>

      {/* ======================== */}
      {/* 6. System Info Section */}
      {/* ======================== */}
      <FadeContent className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            {t("profile.system_info")}
          </h2>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
            <span className="text-muted-foreground">{t("profile.app_version")}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{health?.version || "—"}</span>
              <button
                onClick={async () => {
                  setUpdateLoading(true);
                  try {
                    const info = await checkUpdate(true);
                    setUpdateInfo(info);
                    setUpdateModalOpen(true);
                  } catch {
                    // ignore
                  } finally {
                    setUpdateLoading(false);
                  }
                }}
                disabled={updateLoading}
                className="text-[10px] text-primary hover:underline shrink-0"
              >
                {updateLoading ? (
                  <span className="inline-block w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                ) : (
                  t("update.check_now")
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
            <span className="text-muted-foreground">{t("profile.db_status")}</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${health?.database_status === "ok" ? "bg-green" : "bg-destructive"}`} />
              <span className="font-mono text-xs">{health?.database_status === "ok" ? t("profile.db_ok") : t("profile.db_error")}</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
            <span className="text-muted-foreground">{t("profile.logged_in_as")}</span>
            <span className="font-mono text-xs">{user?.username}</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setHealthLoading(true); setHealthError(""); fetch("/api/health").then(r => r.json()).then(setHealth).catch(e => setHealthError(e.message)).finally(() => setHealthLoading(false)); }}
          disabled={healthLoading}
          className="mt-3 w-full text-xs"
        >
          {healthLoading ? t("profile.refreshing") : t("profile.refresh")}
        </Button>
      </FadeContent>

      {/* ======================== */}
      {/* 7. Logout Section */}
      {/* ======================== */}
      <FadeContent className="section-card">
        <Button
          variant="outline"
          onClick={handleLogout}
          className="w-full h-10 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive hover:bg-destructive/5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {t("profile.logout")}
        </Button>
      </FadeContent>

      {/* Update Modal */}
      {updateInfo && (
        <UpdateModal
          open={updateModalOpen}
          onClose={() => setUpdateModalOpen(false)}
          updateInfo={updateInfo}
        />
      )}
    </div>
  );
}
