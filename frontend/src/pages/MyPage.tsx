import { useState, useEffect, useCallback, useRef, lazy, Suspense, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useEnrich } from "../context/EnrichContext";
import { changePassword, checkUpdate, fetchStats } from "../api";
import { UpdateModal } from "../components/UpdateModal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { getErrMsg } from "../lib/utils";
import FadeContent from "../components/FadeContent";
import { CheckCircle, XCircle, Moon, Sun, Brain, Database, Settings, BarChart3, RefreshCw, Film, Heart, Star, Layers, Sparkles, Loader2, ClipboardList, PieChart, Server, ListTodo } from "lucide-react";

// Operation pages embedded as tabs (lazy-loaded to keep the profile chunk small)
const ManageTab = lazy(() => import("../components/ManageTab").then((m) => ({ default: m.ManageTab })));
const PlaylistsTab = lazy(() => import("../components/PlaylistsTab").then((m) => ({ default: m.PlaylistsTab })));
const StatsTab = lazy(() => import("../components/StatsTab").then((m) => ({ default: m.StatsTab })));
const MediaServerTab = lazy(() => import("../components/MediaServerTab").then((m) => ({ default: m.MediaServerTab })));

/* ── Types ────────────────────────────────────────────────── */

interface HealthStatus {
  status: string;
  version: string;
  database: string;
  database_status: string;
  api_keys: Record<string, boolean>;
}

interface ProfileOverview {
  profile: Record<string, unknown> | null;
  version: number;
  movie_count: number;
  last_updated: string | null;
  stats: {
    avg_rating: number;
    top_genres: string[];
    preferred_decades: string[];
  };
}

interface EmbedStats {
  total_movies: number;
  embedded_movies: number;
  embedding_provider: string;
}

interface MemoryItem {
  id: number;
  text: string;
  type: string;
  confidence: number;
  related_movies: string[];
  created_at: string;
}

interface QuickStats {
  total: number;
  total_watched: number;
  total_wishlist: number;
  avg_rating: number;
}

type TabKey = "manage" | "playlists" | "stats" | "servers" | "ai" | "settings";

const API_KEY_META: Record<string, { label: string; docs: string; placeholder: string; guide?: boolean }> = {
  deepseek: { label: "DeepSeek AI", docs: "https://platform.deepseek.com/", placeholder: "sk-" },
  openai: { label: "OpenAI", docs: "https://platform.openai.com/", placeholder: "sk-proj-" },
  claude: { label: "Claude (Anthropic)", docs: "https://console.anthropic.com/", placeholder: "sk-ant-" },
  gemini: { label: "Gemini (Google)", docs: "https://aistudio.google.com/", placeholder: "AIza" },
  zhipu: { label: "Zhipu GLM (Free)", docs: "https://open.bigmodel.cn/", placeholder: "", guide: true },
  tmdb: { label: "TMDB", docs: "https://www.themoviedb.org/settings/api", placeholder: "" },
};

const MEMORY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  preference: { label: "偏好", color: "text-green bg-green/10" },
  anti_preference: { label: "不喜欢", color: "text-destructive bg-destructive/10" },
  evolution: { label: "演变", color: "text-blue-500 bg-blue-500/10" },
  context: { label: "场景", color: "text-amber-500 bg-amber-500/10" },
  milestone: { label: "里程碑", color: "text-purple-500 bg-purple-500/10" },
};

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */

export function MyPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const { startPolling } = useEnrich();
  const navigate = useNavigate();

  // ── Tab state (URL-synced: /profile?tab=manage etc.) ──
  const [searchParams, setSearchParams] = useSearchParams();
  const TAB_KEYS: TabKey[] = ["manage", "playlists", "stats", "servers", "ai", "settings"];
  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : "manage";
  const setActiveTab = useCallback((key: TabKey) => {
    setSearchParams(key === "manage" ? {} : { tab: key });
  }, [setSearchParams]);

  // ── Data state ──
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);

  // ── Health state ──
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // ── AI Profile state ──
  const [profileOverview, setProfileOverview] = useState<ProfileOverview | null>(null);
  const [embedStats, setEmbedStats] = useState<EmbedStats | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const embedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);

  // ── Password state ──
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  // ── API key state ──
  const [editKeys, setEditKeys] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState(false);
  const [keyConfigOpen, setKeyConfigOpen] = useState(false);

  // ── Export/Import state ──
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);

  // ── Update state ──
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<Parameters<typeof UpdateModal>[0]["updateInfo"] | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);

  /* ── Data fetching ──────────────────────────────────────── */

  // Fetch quick stats
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchStats();
        setQuickStats({
          total: data.total,
          total_watched: data.total_watched,
          total_wishlist: data.total_wishlist,
          avg_rating: data.avg_rating,
        });
      } catch {
        // silently ignore
      }
    };
    load();
  }, []);

  // Fetch health
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/health");
        if (res.ok) setHealth(await res.json());
      } catch { /* ignore */ }
    };
    load();
  }, []);

  // Fetch embed stats (shared by the Overview coverage card and the AI tab)
  const loadEmbedStats = useCallback(async () => {
    try {
      const token = localStorage.getItem("xplora-token");
      const res = await fetch("/api/profile/embed/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setEmbedStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  // Fetch AI profile data
  const loadAIProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const token = localStorage.getItem("xplora-token");
      const headers = { Authorization: `Bearer ${token}` };

      const [overviewRes, memRes, prefsRes] = await Promise.allSettled([
        fetch("/api/profile/overview", { headers }),
        fetch("/api/profile/memories", { headers }),
        fetch("/api/profile/preferences", { headers }),
        loadEmbedStats(), // updates its own state; result not needed here
      ]);

      if (overviewRes.status === "fulfilled" && overviewRes.value.ok) {
        setProfileOverview(await overviewRes.value.json());
      }
      if (memRes.status === "fulfilled" && memRes.value.ok) {
        const data = await memRes.value.json();
        setMemories(data.memories || []);
      }
      if (prefsRes.status === "fulfilled" && prefsRes.value.ok) {
        const data = await prefsRes.value.json();
        setRagEnabled(data.rag_enabled);
      }
    } catch { /* ignore */ } finally {
      setProfileLoading(false);
    }
  }, [loadEmbedStats]);

  // Poll embed stats while embedding is in progress
  const startEmbedPolling = useCallback(() => {
    setIsEmbedding(true);
    // Poll every 2 seconds
    embedPollRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem("xplora-token");
        const res = await fetch("/api/profile/embed/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEmbedStats(data);
          // Stop polling when all movies are embedded
          if (data.embedded_movies >= data.total_movies && data.total_movies > 0) {
            if (embedPollRef.current) clearInterval(embedPollRef.current);
            embedPollRef.current = null;
            setIsEmbedding(false);
            showToast(t("mypage.embed_complete", "嵌入已完成"), "success");
          }
        }
      } catch { /* ignore */ }
    }, 2000);
  }, [showToast, t]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (embedPollRef.current) clearInterval(embedPollRef.current);
    };
  }, []);

  // Fetch embed stats on mount so in-progress embedding can be auto-detected
  useEffect(() => {
    loadEmbedStats();
  }, [loadEmbedStats]);

  useEffect(() => {
    if (activeTab === "ai") {
      loadAIProfile();
    }
  }, [activeTab, loadAIProfile]);

  // Auto-detect in-progress embedding when embed stats load
  useEffect(() => {
    if (embedStats && !isEmbedding && !embedLoading) {
      const incomplete = embedStats.total_movies > 0 && embedStats.embedded_movies < embedStats.total_movies;
      if (incomplete) {
        // Embedding is in progress (triggered earlier or by auto-embed)
        startEmbedPolling();
      }
    }
  }, [embedStats, isEmbedding, embedLoading, startEmbedPolling]);

  // Populate editKeys when health loads
  useEffect(() => {
    if (health?.api_keys) {
      setEditKeys((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const initial: Record<string, string> = {};
        for (const key of Object.keys(API_KEY_META)) initial[key] = "";
        return initial;
      });
    }
  }, [health]);

  /* ── Handlers ───────────────────────────────────────────── */

  const handleSaveKeys = async () => {
    setSavingKeys(true);
    try {
      const token = localStorage.getItem("xplora-token");
      const filledKeys: Record<string, string> = {};
      for (const [key, val] of Object.entries(editKeys)) {
        if (val.trim()) filledKeys[key] = val.trim();
      }
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ api_keys: filledKeys }),
      });
      if (!res.ok) throw new Error("保存失败");
      const data = await res.json();
      setHealth((prev) => prev ? { ...prev, api_keys: data.api_keys } : prev);
      setKeyConfigOpen(false);
      showToast(t("profile.api_saved"), "success");
    } catch (err) {
      showToast(t("profile.api_save_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setSavingKeys(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    if (!oldPassword || !newPassword || !confirmPassword) { setPwError(t("profile.password_empty")); return; }
    if (newPassword.length < 8) { setPwError(t("profile.password_too_short")); return; }
    if (newPassword !== confirmPassword) { setPwError(t("profile.password_mismatch")); return; }
    setPwLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPwSuccess(t("profile.password_success"));
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
      showToast(t("profile.password_success"), "success");
    } catch (err) { setPwError(getErrMsg(err)); } finally { setPwLoading(false); }
  };

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem("xplora-token");
      const res = await fetch("/api/user/export", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("导出失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xplora-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t("profile.export_success"), "success");
    } catch (err) { showToast(t("profile.export_failed", { message: getErrMsg(err) }), "error"); }
    finally { setExporting(false); }
  }, [showToast, t]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) { showToast(t("profile.import_select_json"), "error"); e.target.value = ""; return; }
    setImporting(true); setImportResult(""); setImportSuccess(false);
    try {
      const token = localStorage.getItem("xplora-token");
      const formData = new FormData(); formData.append("file", file);
      const res = await fetch("/api/user/import", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "导入失败"); }
      const data = await res.json();
      const typeLabel = data.status_type === "wish" ? t("profile.import_wish") : t("profile.import_watched");
      setImportResult(t("profile.import_success", { count: data.count, type: typeLabel }));
      setImportSuccess(true);
      showToast(t("profile.import_success", { count: data.count, type: typeLabel }), "success");
      startPolling();
    } catch (err) { setImportResult(t("profile.import_failed", { message: getErrMsg(err) })); setImportSuccess(false); }
    finally { setImporting(false); e.target.value = ""; }
  }, [showToast, t, startPolling]);

  const handleToggleRAG = async () => {
    try {
      const token = localStorage.getItem("xplora-token");
      const newVal = !ragEnabled;
      await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rag_enabled: newVal }),
      });
      setRagEnabled(newVal);
      showToast(newVal ? t("profile.rag_enabled") : t("profile.rag_disabled"), "success");
    } catch { showToast(t("profile.rag_toggle_failed"), "error"); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  /* ── Tab configs ────────────────────────────────────────── */

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "manage", label: t("mypage.tab_manage", "管理"), icon: <ClipboardList size={14} /> },
    { key: "playlists", label: t("playlists.tab_title", "片单"), icon: <ListTodo size={14} /> },
    { key: "stats", label: t("mypage.tab_stats", "统计"), icon: <PieChart size={14} /> },
    { key: "servers", label: t("mypage.tab_servers", "媒体服务器"), icon: <Server size={14} /> },
    { key: "ai", label: t("mypage.tab_ai", "AI 画像"), icon: <Brain size={14} /> },
    { key: "settings", label: t("mypage.tab_settings", "设置"), icon: <Settings size={14} /> },
  ];

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5">

      {/* ── Back link ── */}
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
        </svg>
        {t("profile.back_home")}
      </button>

      {/* ═══════════════════════════════════════════════════════
          IDENTITY CARD
         ═══════════════════════════════════════════════════════ */}
      <FadeContent>
        <div
          className="relative overflow-hidden rounded-2xl p-5 sm:p-6"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, var(--seed-primary) 8%, var(--seed-surface)), var(--seed-bg) 70%)`,
            border: "1px solid color-mix(in srgb, var(--seed-primary) 14%, transparent)",
          }}
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-[0.06] blur-3xl pointer-events-none" style={{ background: "var(--seed-primary)" }} />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-xl font-semibold text-foreground shrink-0 ring-2 ring-primary/20">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground truncate">{user?.username}</h1>
                <Badge variant={user?.is_admin ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {user?.is_admin ? t("profile.admin") : t("profile.user")}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {health && <span>{health.version}</span>}
                {quickStats && (
                  <span className="flex items-center gap-1">
                    <Film size={11} />
                    {quickStats.total_watched} {t("mypage.watched", "已看")}
                    <span className="text-border mx-0.5">·</span>
                    <Heart size={11} />
                    {quickStats.total_wishlist} {t("mypage.wishlist", "想看")}
                  </span>
                )}
              </div>
            </div>
            {/* Quick logout */}
            <button
              onClick={handleLogout}
              className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
              title={t("profile.logout")}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </FadeContent>

      {/* ═══════════════════════════════════════════════════════
          TAB NAVIGATION
         ═══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          TAB: MANAGE (embedded ManageTab)
         ═══════════════════════════════════════════════════════ */}
      {activeTab === "manage" && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        }>
          <ManageTab />
        </Suspense>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: PLAYLISTS (embedded PlaylistsTab)
         ═══════════════════════════════════════════════════════ */}
      {activeTab === "playlists" && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        }>
          <PlaylistsTab />
        </Suspense>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: STATS (embedded StatsTab)
         ═══════════════════════════════════════════════════════ */}
      {activeTab === "stats" && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        }>
          <StatsTab />
        </Suspense>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: MEDIA SERVERS (embedded MediaServerTab)
         ═══════════════════════════════════════════════════════ */}
      {activeTab === "servers" && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        }>
          <MediaServerTab />
        </Suspense>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: AI PROFILE
         ═══════════════════════════════════════════════════════ */}
      {activeTab === "ai" && (
        <div className="space-y-4">

          {/* ── RAG Toggle ── */}
          <FadeContent>
            <div className="section-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 shrink-0">
                    <Brain size={16} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("profile.rag_embedding")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{t("profile.rag_embedding_desc")}</p>
                  </div>
                </div>
                <button
                  onClick={handleToggleRAG}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                    ragEnabled ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                    ragEnabled ? "translate-x-[24px]" : "translate-x-0"
                  }`} />
                </button>
              </div>
            </div>
          </FadeContent>

          {/* ── Profile Overview ── */}
          <FadeContent delay={80}>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" />
                  {t("mypage.taste_profile", "品味画像")}
                </h2>
                <button
                  onClick={loadAIProfile}
                  disabled={profileLoading}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  {profileLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {t("mypage.refresh", "刷新")}
                </button>
              </div>

              {profileOverview?.profile ? (
                <div className="space-y-3">
                  {/* Stats row */}
                  <div className="flex flex-wrap gap-2">
                    {profileOverview.stats?.top_genres?.map((g) => (
                      <Badge key={g} variant="secondary" className="text-[11px]">{g}</Badge>
                    ))}
                  </div>
                  {profileOverview.stats?.avg_rating > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Star size={12} className="text-amber-500" />
                      {t("mypage.avg_rating_label", "平均评分")}:
                      <span className="font-medium text-foreground">{profileOverview.stats.avg_rating.toFixed(1)}</span>
                    </div>
                  )}
                  {profileOverview.stats?.preferred_decades?.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BarChart3 size={12} className="text-blue-500" />
                      {t("mypage.preferred_decades", "偏好年代")}:
                      <span className="font-medium text-foreground">{profileOverview.stats.preferred_decades.join(", ")}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    <span>{t("mypage.profile_version", "版本")}: {profileOverview.version}</span>
                    <span>·</span>
                    <span>{t("mypage.movies_analyzed", "分析电影数")}: {profileOverview.movie_count}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-2">
                    {ragEnabled ? t("mypage.no_profile_yet", "尚未生成品味画像") : t("mypage.rag_disabled_notice", "请先启用智能品味分析")}
                  </p>
                  {ragEnabled && embedStats && embedStats.embedded_movies >= 5 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem("xplora-token");
                          const res = await fetch("/api/profile/rebuild?model=deepseek", {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          if (res.ok) { showToast(t("mypage.profile_rebuilt", "画像已重建"), "success"); loadAIProfile(); }
                          else { showToast(t("mypage.profile_rebuild_failed", "重建失败"), "error"); }
                        } catch { showToast(t("mypage.profile_rebuild_failed", "重建失败"), "error"); }
                      }}
                    >
                      <Sparkles size={12} className="mr-1" />
                      {t("mypage.build_profile", "生成画像")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </FadeContent>

          {/* ── Embedding Stats ── */}
          <FadeContent delay={160}>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  <Layers size={14} className="text-primary" />
                  {t("mypage.embedding_status", "嵌入状态")}
                </h2>
                <button
                  onClick={async () => {
                    setEmbedLoading(true);
                    try {
                      const token = localStorage.getItem("xplora-token");
                      const res = await fetch("/api/profile/embed", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                      if (res.ok) {
                        showToast(t("mypage.embed_triggered", "嵌入已触发"), "success");
                        // Start polling for real-time progress
                        startEmbedPolling();
                        // Also refresh profile data
                        loadAIProfile();
                      } else {
                        showToast(t("mypage.embed_trigger_failed", "触发失败"), "error");
                      }
                    } catch { showToast(t("mypage.embed_trigger_failed", "触发失败"), "error"); }
                    finally { setEmbedLoading(false); }
                  }}
                  disabled={embedLoading || isEmbedding || !ragEnabled}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 disabled:opacity-40"
                >
                  {(embedLoading || isEmbedding) ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {isEmbedding ? t("mypage.embedding_now", "嵌入中...") : t("mypage.embed_now", "立即嵌入")}
                </button>
              </div>

              {embedStats ? (
                <div className="space-y-3">
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        {isEmbedding && <Loader2 size={11} className="animate-spin text-primary" />}
                        {t("mypage.embed_progress", "嵌入进度")}
                      </span>
                      <span className="font-medium">
                        {embedStats.embedded_movies} / {embedStats.total_movies}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isEmbedding && embedStats.embedded_movies < embedStats.total_movies
                            ? "bg-primary/70 animate-pulse"
                            : "bg-primary"
                        }`}
                        style={{
                          width: embedStats.total_movies > 0
                            ? `${Math.min(100, (embedStats.embedded_movies / embedStats.total_movies) * 100)}%`
                            : "0%"
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{t("mypage.provider", "模型")}: {embedStats.embedding_provider}</span>
                    {isEmbedding ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Loader2 size={11} className="animate-spin" />
                        {t("mypage.embedding_in_progress", "正在嵌入...")}
                      </span>
                    ) : embedStats.embedded_movies === embedStats.total_movies && embedStats.total_movies > 0 ? (
                      <span className="flex items-center gap-1 text-green">
                        <CheckCircle size={11} />
                        {t("mypage.embed_complete", "已完成")}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {ragEnabled ? t("mypage.no_embed_data", "暂无嵌入数据") : t("mypage.rag_disabled_notice", "请先启用智能品味分析")}
                </p>
              )}
            </div>
          </FadeContent>

          {/* ── Memories ── */}
          <FadeContent delay={240}>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  <Brain size={14} className="text-primary" />
                  {t("mypage.taste_memories", "品味记忆")}
                  {memories.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-1">{memories.length}</Badge>
                  )}
                </h2>
                <button
                  onClick={async () => {
                    setMemoryLoading(true);
                    try {
                      const token = localStorage.getItem("xplora-token");
                      const res = await fetch("/api/profile/memories/generate?model=deepseek", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (res.ok) { showToast(t("mypage.memories_generated", "记忆已生成"), "success"); loadAIProfile(); }
                      else { showToast(t("mypage.memories_generate_failed", "生成失败"), "error"); }
                    } catch { showToast(t("mypage.memories_generate_failed", "生成失败"), "error"); }
                    finally { setMemoryLoading(false); }
                  }}
                  disabled={memoryLoading || !ragEnabled}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 disabled:opacity-40"
                >
                  {memoryLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {t("mypage.generate_memories", "生成记忆")}
                </button>
              </div>

              {memories.length > 0 ? (
                <div className="space-y-2">
                  {memories.map((mem) => {
                    const meta = MEMORY_TYPE_LABELS[mem.type] || { label: mem.type, color: "text-muted-foreground bg-muted" };
                    return (
                      <div key={mem.id} className="px-3 py-2.5 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>
                            {meta.label}
                          </span>
                          <p className="text-sm text-foreground/80 leading-relaxed flex-1 min-w-0">{mem.text}</p>
                        </div>
                        {mem.related_movies?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 ml-[52px]">
                            {mem.related_movies.slice(0, 4).map((m) => (
                              <span key={m} className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">{m}</span>
                            ))}
                            {mem.related_movies.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">+{mem.related_movies.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {ragEnabled ? t("mypage.no_memories", "暂无品味记忆") : t("mypage.rag_disabled_notice", "请先启用智能品味分析")}
                </p>
              )}
            </div>
          </FadeContent>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: SETTINGS
         ═══════════════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div className="space-y-4">

          {/* ── Theme ── */}
          <FadeContent>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  {theme === "dark" ? <Moon size={14} className="text-primary" /> : <Sun size={14} className="text-primary" />}
                  {t("profile.theme")}
                </h2>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{theme === "dark" ? t("profile.dark_mode") : t("profile.light_mode")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{theme === "dark" ? t("profile.dark_hint") : t("profile.light_hint")}</p>
                </div>
                <button
                  onClick={(e) => toggleTheme(e)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform flex items-center justify-center text-[9px] ${
                    theme === "dark" ? "translate-x-6" : "translate-x-0.5"
                  }`}>
                    {theme === "dark" ? <Moon size={9} /> : <Sun size={9} />}
                  </span>
                </button>
              </div>
            </div>
          </FadeContent>

          {/* ── API Keys ── */}
          <FadeContent delay={80}>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {t("profile.api_status")}
                </h2>
                {user?.is_admin && (
                  <button onClick={() => setKeyConfigOpen(!keyConfigOpen)} className="text-[11px] text-primary hover:underline">
                    {keyConfigOpen ? t("profile.api_cancel") : t("profile.api_configure")}
                  </button>
                )}
              </div>

              {health && (
                <div className="space-y-1.5">
                  {Object.entries(API_KEY_META).map(([key, { label, docs, placeholder }]) => {
                    const configured = health.api_keys?.[key];
                    return (
                      <div key={key} className="py-1.5 px-3 rounded-lg bg-muted/30">
                        {keyConfigOpen && user?.is_admin ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <label className="block text-[11px] text-muted-foreground mb-0.5">{label}</label>
                              <input
                                type="password"
                                value={editKeys[key] ?? ""}
                                onChange={(e) => setEditKeys((prev) => ({ ...prev, [key]: e.target.value }))}
                                placeholder={`${label} API Key${placeholder ? ` (${placeholder}...)` : ""}`}
                                className="w-full h-8 px-2.5 rounded-md border border-input bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/20 font-mono"
                              />
                            </div>
                            <a href={docs} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[10px] text-primary hover:underline mt-4">
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
                                <a href={docs} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">
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
                    onClick={() => { setKeyConfigOpen(false); const i: Record<string, string> = {}; for (const k of Object.keys(API_KEY_META)) i[k] = ""; setEditKeys(i); }}
                    className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >{t("profile.api_cancel")}</button>
                  <button onClick={handleSaveKeys} disabled={savingKeys}
                    className="h-8 px-4 rounded-lg text-xs font-medium bg-foreground text-background transition-all hover:opacity-90 disabled:opacity-50"
                  >{savingKeys ? t("profile.api_saving") : t("profile.api_save")}</button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">
                {keyConfigOpen ? t("profile.api_hint_edit") : t("profile.api_hint_view")}
              </p>
            </div>
          </FadeContent>

          {/* ── Change Password ── */}
          <FadeContent delay={160}>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {t("profile.change_password")}
                </h2>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-muted-foreground">{t("profile.current_password")}</label>
                  <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password"
                    className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/20" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="block text-xs font-medium text-muted-foreground">{t("profile.new_password")}</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password"
                      className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/20" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="block text-xs font-medium text-muted-foreground">{t("profile.confirm_password")}</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password"
                      className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/20" />
                  </div>
                </div>
                {pwError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{pwError}</p>}
                {pwSuccess && <p className="text-sm text-emerald-500 bg-emerald-500/10 rounded-lg px-3 py-2">{pwSuccess}</p>}
                <Button type="submit" disabled={pwLoading} size="sm" className="w-full">
                  {pwLoading ? t("profile.password_changing") : t("profile.change_password")}
                </Button>
              </form>
            </div>
          </FadeContent>

          {/* ── Data Management ── */}
          <FadeContent delay={200}>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  <Database size={14} className="text-primary" />
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
                        <Loader2 size={12} className="animate-spin" />
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
                    <input type="file" accept=".json" onChange={handleImport} disabled={importing} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <Button variant="outline" size="sm" disabled={importing}>
                      {importing ? (
                        <span className="flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" />
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
                    importSuccess ? "text-emerald-500 bg-emerald-500/10" : "text-destructive bg-destructive/10"
                  }`}>
                    {importSuccess ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {importResult}
                  </p>
                )}
              </div>
            </div>
          </FadeContent>

          {/* ── System Info ── */}
          <FadeContent delay={240}>
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title flex items-center gap-2">
                  <Settings size={14} className="text-primary" />
                  {t("profile.system_info")}
                </h2>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">{t("profile.app_version")}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{health?.version || "—"}</span>
                    <button
                      onClick={async () => {
                        setUpdateLoading(true);
                        try { const info = await checkUpdate(true); setUpdateInfo(info); setUpdateModalOpen(true); } catch { /* ignore */ }
                        finally { setUpdateLoading(false); }
                      }}
                      disabled={updateLoading}
                      className="text-[10px] text-primary hover:underline"
                    >
                      {updateLoading ? <Loader2 size={10} className="animate-spin" /> : t("update.check_now")}
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
              </div>
            </div>
          </FadeContent>
        </div>
      )}

      {/* ── Update Modal ── */}
      {updateInfo && (
        <UpdateModal open={updateModalOpen} onClose={() => setUpdateModalOpen(false)} updateInfo={updateInfo} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════ */


