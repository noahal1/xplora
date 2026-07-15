import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import {
  listMediaServers,
  addMediaServer,
  updateMediaServer,
  deleteMediaServer,
  verifyMediaServer,
  verifySavedMediaServer,
  getMediaServerLibraries,
  getMediaServerLibraryItems,
  refreshMediaServer,
  importWatchedFromServer,
  syncMediaServerLibrary,
} from "../../api";
import type { MediaServer, ServerFormData, VerifyResult, MediaLibrary, LibraryItem } from "../../types";
import { Modal } from "../Modal";
import FadeContent from "../FadeContent";
import { getErrMsg } from "../../lib/utils";
import { Server, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Network, Library, AlertTriangle, Download } from "lucide-react";
import { MoviePilotConfig } from "./MoviePilotConfig";


// ── Default form state ────────────────────────────────────────────

const DEFAULT_FORM: ServerFormData = {
  name: "",
  server_type: "jellyfin",
  host: "",
  port: 8096,
  api_key: "",
  username: "",
  password: "",
  use_ssl: false,
};

// ── Component ─────────────────────────────────────────────────────

export function MediaServerTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [servers, setServers] = useState<MediaServer[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal & form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ServerFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  // Library & detail state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);
  const [loadingLibs, setLoadingLibs] = useState(false);
  const [expandedLibId, setExpandedLibId] = useState<string | null>(null);
  const [libItems, setLibItems] = useState<LibraryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [libItemTotal, setLibItemTotal] = useState(0);
  const [libItemPage, setLibItemPage] = useState(0);
  const LIB_ITEMS_PER_PAGE = 30;
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MediaServer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Load servers ──────────────────────────────────────────────

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMediaServers();
      setServers(data);
    } catch (err) {
      showToast(t("media_server.load_failed") + ": " + getErrMsg(err), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // ── Form helpers ──────────────────────────────────────────────

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setVerifyResult(null);
  };

  const openEdit = (server: MediaServer) => {
    setForm({
      name: server.name,
      server_type: server.server_type,
      host: server.host,
      port: server.port,
      api_key: "",  // Never pre-fill API key — user must re-enter
      username: "",  // never pre-fill username
      password: "",  // Never pre-fill password
      use_ssl: server.use_ssl,
    });
    setEditingId(server.id);
    setVerifyResult(null);
    setShowForm(true);
  };

  // ── Verify ─────────────────────────────────────────────────────

  const handleVerify = async () => {
    if (!form.host) {
      showToast(t("media_server.fill_host_and_key"), "error");
      return;
    }
    if (form.server_type === "feiniu") {
      if (!form.username || !form.password) {
        showToast(t("media_server.fill_username_password"), "error");
        return;
      }
    } else if (!form.api_key) {
      showToast(t("media_server.fill_host_and_key"), "error");
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyMediaServer({ ...form, port: resolvePort(form) });
      setVerifyResult(result);
      // If feiniu verify returned a token, store it
      if (form.server_type === "feiniu" && (result as any)._token) {
        setForm(prev => ({ ...prev, api_key: (result as any)._token }));
      }
      if (result.online) {
        showToast(t("media_server.verify_success"), "success");
      } else {
        showToast(t("media_server.verify_failed", { message: result.message }), "error");
      }
    } catch (err) {
      setVerifyResult({ online: false, version: "", server_name: "", message: getErrMsg(err) });
      showToast(t("media_server.verify_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setVerifying(false);
    }
  };

  // ── Save ───────────────────────────────────────────────────────

  /** Normalise port before sending to API — empty string → default per type */
  const resolvePort = (f: ServerFormData) =>
    f.port === "" ? (f.server_type === "feiniu" ? 8005 : 8096) : f.port;

  const handleSave = async () => {
    if (!form.name || !form.host) {
      showToast(t("media_server.fill_required"), "error");
      return;
    }
    if (form.server_type === "jellyfin" && !form.api_key) {
      showToast(t("media_server.fill_host_and_key"), "error");
      return;
    }
    if (form.server_type === "feiniu" && (!form.username || !form.password) && !form.api_key) {
      showToast(t("media_server.fill_username_password"), "error");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, port: resolvePort(form) };
      if (editingId) {
        await updateMediaServer(editingId, payload);
        showToast(t("media_server.update_success"), "success");
      } else {
        await addMediaServer(payload);
        showToast(t("media_server.saved"), "success");
      }
      setShowForm(false);
      resetForm();
      loadServers();
    } catch (err) {
      showToast(t("media_server.save_failed") + ": " + getErrMsg(err), "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMediaServer(deleteTarget.id);
      showToast(t("media_server.deleted"), "success");
      setDeleteTarget(null);
      loadServers();
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setDeleting(false);
    }
  };

  // ── Toggle libraries ──────────────────────────────────────────

  const toggleLibraries = async (server: MediaServer) => {
    if (expandedId === server.id) {
      setExpandedId(null);
      setLibraries([]);
      setExpandedLibId(null);
      setLibItems([]);
      return;
    }
    setExpandedId(server.id);
    setExpandedLibId(null);
    setLibItems([]);
    setLoadingLibs(true);
    setLibraries([]);
    try {
      const libs = await getMediaServerLibraries(server.id);
      setLibraries(libs);
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setLoadingLibs(false);
    }
  };

  // ── Toggle library items ─────────────────────────────────────

  const toggleLibraryItems = async (libId: string, serverId: number, page: number = 0) => {
    if (expandedLibId === libId) {
      setExpandedLibId(null);
      setLibItems([]);
      return;
    }
    setExpandedLibId(libId);
    setLoadingItems(true);
    setLibItems([]);
    setLibItemPage(page);
    try {
      const result = await getMediaServerLibraryItems(serverId, libId, LIB_ITEMS_PER_PAGE, page * LIB_ITEMS_PER_PAGE);
      setLibItems(result.items);
      setLibItemTotal(result.total);
    } catch (err) {
      showToast(getErrMsg(err), "error");
      setLibItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  // ── Refresh library ──────────────────────────────────────────

  // ── Sync library cache ─────────────────────────────────────

  const handleSync = async (server: MediaServer) => {
    setSyncingId(server.id);
    try {
      const result = await syncMediaServerLibrary(server.id);
      showToast(result.message, "success");
      loadServers();  // Refresh to update last_synced
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setSyncingId(null);
    }
  };

  const handleRefresh = async (server: MediaServer, libraryId?: string) => {
    setRefreshingId(server.id);
    try {
      await refreshMediaServer(server.id, libraryId);
      showToast(t("media_server.refresh_success"), "success");
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setRefreshingId(null);
    }
  };

  // ── Status badge ─────────────────────────────────────────────

  const StatusBadge = ({ server }: { server: MediaServer }) => {
    if (!server.last_connected) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/50 text-muted-foreground">
          <Network size={10} />
          {t("media_server.status_unknown")}
        </span>
      );
    }
    // Assume online if connected — we can re-verify inline
    const isOnline = server.is_active;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
          isOnline
            ? "bg-green-500/10 text-green-600 dark:text-green-400"
            : "bg-red-500/10 text-red-600 dark:text-red-400"
        }`}
      >
        {isOnline ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
        {isOnline ? t("media_server.status_online") : t("media_server.status_offline")}
      </span>
    );
  };

  // ── Import Watched state ──
  const [importingWatched, setImportingWatched] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; moved_from_wishlist: number; skipped: number; message: string } | null>(null);

  const handleImportWatched = async (server: MediaServer) => {
    setImportingWatched(true);
    try {
      const result = await importWatchedFromServer(server.id);
      setImportResult(result);
      showToast(result.message, "success");
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setImportingWatched(false);
    }
  };

  // ── MP Modal state ──
  const [showMPConfig, setShowMPConfig] = useState(false);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <FadeContent className="section-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Server size={18} className="text-primary" />
              {t("media_server.title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t("media_server.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMPConfig(true)}
              className="btn btn-ghost btn-sm gap-1.5"
            >
              <Download size={14} />
              {t("moviepilot.tab_title")}
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="btn btn-primary btn-sm gap-1.5"
            >
              <Plus size={14} />
              {t("media_server.add_server")}
            </button>
          </div>
        </div>
      </FadeContent>

      {/* Server list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg skeleton" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <FadeContent className="flex flex-col items-center justify-center py-16 text-center">
          <Server size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t("media_server.no_servers")}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t("media_server.no_servers_hint")}</p>
        </FadeContent>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => (
            <FadeContent key={server.id} className="section-card p-4">
              {/* Server card header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Server size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium truncate">{server.name}</h3>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        {server.server_type === "jellyfin" ? t("media_server.server_type_jellyfin") : server.server_type}
                      </span>
                      <StatusBadge server={server} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {server.use_ssl ? "https" : "http"}://{server.host}:{server.port}
                    </p>
                    {server.last_connected && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {t("common.watched")}: {new Date(server.last_connected).toLocaleString()}
                      </p>
                    )}
                    {server.last_synced && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9"/>
                        </svg>
                        {t("media_server.last_synced")}: {new Date(server.last_synced).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleLibraries(server)}
                    className="btn btn-ghost btn-xs gap-1"
                    title={t("media_server.libraries")}
                  >
                    <Library size={12} />
                  </button>                      <button
                        onClick={() => handleImportWatched(server)}
                        disabled={importingWatched}
                        className="btn btn-ghost btn-xs gap-1"
                        title={t("media_server.import_watched")}
                      >
                        {importingWatched ? (
                          <div className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                      </button>
                      <button
                        onClick={() => handleSync(server)}
                        disabled={syncingId === server.id}
                        className="btn btn-ghost btn-xs gap-1"
                        title={t("media_server.sync_library")}
                      >
                        {syncingId === server.id ? (
                          <div className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9"/>
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleRefresh(server)}
                        disabled={refreshingId === server.id}
                        className="btn btn-ghost btn-xs gap-1"
                        title={t("media_server.refresh")}
                      >
                        <RefreshCw size={12} className={refreshingId === server.id ? "animate-stream-spin" : ""} />
                      </button>
                  <button
                    onClick={() => openEdit(server)}
                    className="btn btn-ghost btn-xs"
                    title={t("media_server.edit")}
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(server)}
                    className="btn btn-ghost btn-xs text-destructive hover:text-destructive"
                    title={t("media_server.delete")}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Library list (expandable) */}
              {expandedId === server.id && (
                <div className="mt-3 pt-3 border-t border-border">
                  {loadingLibs ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                      {t("common.loading")}
                    </div>
                  ) : libraries.length === 0 ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <AlertTriangle size={12} />
                      {t("media_server.no_libraries_hint")}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("media_server.libraries")} ({libraries.length})
                        </span>
                        <button
                          onClick={() => handleRefresh(server)}
                          disabled={refreshingId === server.id}
                          className="btn btn-ghost btn-xs gap-1"
                        >
                          <RefreshCw size={10} className={refreshingId === server.id ? "animate-stream-spin" : ""} />
                          {t("media_server.refresh_all")}
                        </button>
                      </div>
                      {libraries.map((lib) => (
                        <div key={lib.id}>
                          {/* Library header row (clickable) */}
                          <div
                            onClick={() => toggleLibraryItems(lib.id, server.id)}
                            className={`flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
                              expandedLibId === lib.id
                                ? "bg-accent/50"
                                : "hover:bg-accent/30"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`transition-transform duration-200 ${
                                expandedLibId === lib.id ? "rotate-90" : ""
                              }`}>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-muted-foreground">
                                  <path d="M3 2 L7 5 L3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                              <Library size={12} className="text-muted-foreground shrink-0" />
                              <span className="text-xs truncate">{lib.name}</span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                lib.media_type === "movies" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                                lib.media_type === "shows" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                                "bg-accent text-accent-foreground"
                              }`}>
                                {lib.media_type === "movies" ? t("stats.movie") :
                                 lib.media_type === "shows" ? t("stats.tv") :
                                 lib.media_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {t("media_server.total_items", { count: lib.item_count })}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRefresh(server, lib.id); }}
                                disabled={refreshingId === server.id}
                                className="btn btn-ghost btn-xs p-1"
                                title={t("media_server.refresh")}
                              >
                                <RefreshCw size={10} className={refreshingId === server.id ? "animate-stream-spin" : ""} />
                              </button>
                            </div>
                          </div>

                          {/* Library items (expandable) */}
                          {expandedLibId === lib.id && (
                            <div className="ml-4 mt-1 mb-2 border-l border-border/50 pl-3">
                              {loadingItems ? (
                                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                                  <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                                  {t("common.loading")}
                                </div>
                              ) : libItems.length === 0 ? (
                                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                                  <span>{t("media_server.no_items_hint")}</span>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  {libItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/20 transition-colors"
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        item.media_type === "movie" ? "bg-blue-500" :
                                        item.media_type === "episode" ? "bg-green-500" :
                                        item.media_type === "series" ? "bg-purple-500" :
                                        "bg-accent-foreground/30"
                                      }`} />
                                      <span className="text-xs truncate flex-1">{item.title}</span>
                                      {item.year && (
                                        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                                          {item.year}
                                        </span>
                                      )}
                                    </div>
                                  ))}

                                  {/* Pagination */}
                                  {libItemTotal > LIB_ITEMS_PER_PAGE && (
                                    <div className="flex items-center justify-center gap-2 pt-2 pb-1">
                                      <button
                                        onClick={() => toggleLibraryItems(lib.id, server.id, libItemPage - 1)}
                                        disabled={libItemPage === 0 || loadingItems}
                                        className="btn btn-ghost btn-xs px-2"
                                      >
                                        ←
                                      </button>
                                      <span className="text-[10px] text-muted-foreground tabular-nums">
                                        {libItemPage + 1}/{Math.max(1, Math.ceil(libItemTotal / LIB_ITEMS_PER_PAGE))}
                                      </span>
                                      <button
                                        onClick={() => toggleLibraryItems(lib.id, server.id, libItemPage + 1)}
                                        disabled={(libItemPage + 1) * LIB_ITEMS_PER_PAGE >= libItemTotal || loadingItems}
                                        className="btn btn-ghost btn-xs px-2"
                                      >
                                        →
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </FadeContent>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ───────────────────────────────────── */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editingId ? t("media_server.edit_title") : t("media_server.add_title")}
      >
        <div className="space-y-4">
          {/* Server name */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t("media_server.server_name")}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("media_server.server_name_placeholder")}
              className="input-field w-full h-9 text-sm"
            />
          </div>

          {/* Server type */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t("media_server.server_type")}</label>
            <div className="flex gap-2">
              {["jellyfin", "feiniu"].map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    // Keep the current port if the user already customised it
                    const port = form.port === "" || form.port === 0
                      ? (type === "feiniu" ? 8005 : 8096)
                      : form.port;
                    setForm({ ...form, server_type: type, api_key: "", username: "", password: "", port });
                  }}
                  className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all ${
                    form.server_type === type
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-accent/50 text-muted-foreground border border-border hover:border-primary/20"
                  }`}
                >
                  {type === "jellyfin" ? t("media_server.server_type_jellyfin") :
                   type === "feiniu" ? t("media_server.server_type_feiniu") : type}
                </button>
              ))}
            </div>
          </div>

          {/* Host */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t("media_server.host")}</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder={t("media_server.host_placeholder")}
              className="input-field w-full h-9 text-sm"
            />
          </div>

          {/* Port + SSL */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1.5">{t("media_server.port")}</label>                    <input
                type="number"
                value={form.port}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({
                    ...form,
                    port: val === "" ? "" : parseInt(val, 10) || 0,
                  });
                }}
                className="input-field w-full h-9 text-sm no-spinner"
                placeholder={form.server_type === "feiniu" ? "8005" : "8096"}
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.use_ssl}
                  onChange={(e) => setForm({ ...form, use_ssl: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-input accent-primary"
                />
                <span className="text-xs text-muted-foreground">{t("media_server.use_ssl")}</span>
              </label>
            </div>
          </div>

          {/* FeiNiu: username + password */}
          {form.server_type === "feiniu" ? (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">{t("media_server.username")}</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder={t("media_server.username_placeholder")}
                  className="input-field w-full h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">{t("media_server.password")}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingId ? "••••••••" : t("media_server.password_placeholder")}
                  className="input-field w-full h-9 text-sm"
                />
              </div>
            </>
          ) : (
            /* Jellyfin: API Key */
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">{t("media_server.api_key")}</label>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={editingId ? "••••••••" : t("media_server.api_key_placeholder")}
                className="input-field w-full h-9 text-sm"
              />
            </div>
          )}

          {/* Verify result */}
          {verifyResult && (
            <div className={`p-3 rounded-lg text-xs ${
              verifyResult.online
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
            }`}>
              <div className="flex items-center gap-1.5">
                {verifyResult.online ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span className="font-medium">{verifyResult.message}</span>
              </div>
              {verifyResult.version && (
                <p className="mt-1 text-muted-foreground/60">
                  {verifyResult.server_name} v{verifyResult.version}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleVerify}
              disabled={verifying || !form.host || (form.server_type === "jellyfin" && !form.api_key) || (form.server_type === "feiniu" && (!form.username || !form.password))}
              className="btn btn-ghost btn-sm flex-1 gap-1.5"
            >
              {verifying ? (
                <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
              ) : (
                <Network size={14} />
              )}
              {verifying ? t("media_server.verifying") : t("media_server.verify")}
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="btn btn-ghost btn-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.host || (form.server_type === "jellyfin" && !form.api_key)}
              className="btn btn-primary btn-sm gap-1.5"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-stream-spin" />
              ) : null}
              {saving ? t("media_server.saving") : t("media_server.save")}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ──────────────────────────── */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("common.delete")}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("media_server.delete_confirm", { name: deleteTarget?.name || "" })}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {t("media_server.delete_confirm_desc")}
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={() => setDeleteTarget(null)}
              className="btn btn-ghost btn-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn btn-sm bg-destructive text-white"
              style={{ borderColor: "transparent" }}
            >
              {deleting ? t("common.loading") : t("common.delete")}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MoviePilot Config Modal ───────────────────────────── */}
      <Modal
        open={showMPConfig}
        onClose={() => setShowMPConfig(false)}
        title={t("moviepilot.title")}
        size="lg"
      >
        <MoviePilotConfig />
      </Modal>

      {/* ── Import Watched Result Modal ───────────────────────── */}
      <Modal
        open={importResult !== null}
        onClose={() => setImportResult(null)}
        title={t("media_server.import_watched_title")}
      >
        {importResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <CheckCircle2 size={20} className="text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{importResult.message}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{importResult.imported}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("media_server.import_new")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{importResult.moved_from_wishlist}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("media_server.import_moved")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-accent/50 border border-border">
                <p className="text-lg font-bold text-muted-foreground">{importResult.skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("media_server.import_skipped")}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setImportResult(null)}
                className="btn btn-primary btn-sm"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
