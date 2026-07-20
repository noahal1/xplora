import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import {
  getMPConfig,
  saveMPConfig,
  deleteMPConfig,
  testMPConnection,
  getMPTorrents,
} from "../../api";
import type { MoviePilotConfig as MPConfig, MoviePilotTorrent } from "../../types";
import { Modal } from "../Modal";
import FadeContent from "../FadeContent";
import { getErrMsg, formatBytes, formatSpeed, formatProgress, getStatusLabel, getStatusColor } from "../../lib/utils";
import {
  Download,
  CheckCircle2,
  XCircle,
  Trash2,
  Network,
  Upload,
  HardDrive,
  AlertTriangle,
} from "lucide-react";

// ── Component ─────────────────────────────────────────────────────

export function MoviePilotConfig() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // ── Config state ──
  const [config, setConfig] = useState<MPConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Form state ──
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number | "">(3000);
  const [apiToken, setApiToken] = useState("");
  const [useSsl, setUseSsl] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Torrent queue ──
  const [torrents, setTorrents] = useState<MoviePilotTorrent[]>([]);
  const [loadingTorrents, setLoadingTorrents] = useState(false);

  // ── Delete confirmation ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Load config ──

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMPConfig();
      if (data.configured) {
        setConfig(data);
        setHost(data.host);
        setPort(data.port);
        setUseSsl(data.use_ssl);
        // Don't pre-fill api_token
      } else {
        setConfig(null);
      }
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadTorrents = useCallback(async () => {
    setLoadingTorrents(true);
    try {
      const data = await getMPTorrents();
      setTorrents(data.torrents);
    } catch {
      // Silently fail — user may not have configured MP yet
    } finally {
      setLoadingTorrents(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config?.configured) {
      loadTorrents();
      // Refresh every 10 seconds
      const interval = setInterval(loadTorrents, 10000);
      return () => clearInterval(interval);
    }
  }, [config?.configured, loadTorrents]);

  // ── Verify ──

  const handleVerify = async () => {
    if (!host || !apiToken) {
      showToast(t("moviepilot.fill_required"), "error");
      return;
    }
    setVerifying(true);
    try {
      const result = await testMPConnection({ host, port: port === "" ? 3000 : port, api_token: apiToken, use_ssl: useSsl });
      if (result.online) {
        showToast(t("moviepilot.verify_success"), "success");
      } else {
        showToast(t("moviepilot.verify_failed", { message: result.message }), "error");
      }
    } catch (err) {
      showToast(t("moviepilot.verify_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setVerifying(false);
    }
  };

  // ── Save ──

  const handleSave = async () => {
    if (!host || !apiToken) {
      showToast(t("moviepilot.fill_required"), "error");
      return;
    }
    setSaving(true);
    try {
      await saveMPConfig({ host, port: port === "" ? 3000 : port, api_token: apiToken, use_ssl: useSsl });
      showToast(t("moviepilot.saved"), "success");
      loadConfig();
      loadTorrents();
    } catch (err) {
      showToast(t("common.save") + ": " + getErrMsg(err), "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMPConfig();
      showToast(t("moviepilot.deleted"), "success");
      setShowDeleteConfirm(false);
      setConfig(null);
      setHost("");
      setPort("");
      setApiToken("");
      setUseSsl(false);
      setTorrents([]);
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setDeleting(false);
    }
  };

  // ── Status badge ──

  const StatusBadge = () => {
    if (!config?.configured) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/50 text-muted-foreground">
          <Network size={10} />
          {t("media_server.status_unknown")}
        </span>
      );
    }
    const isOnline = config.is_active && config.last_connected;
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

  // ── Render ──

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 rounded-lg skeleton" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Config Section ── */}
      <FadeContent className="section-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Download size={16} className="text-primary" />
              {t("moviepilot.config_title")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("moviepilot.subtitle")}
            </p>
          </div>
          <StatusBadge />
        </div>

        {/* ── Connection form ── */}
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1.5">{t("moviepilot.host")}</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t("moviepilot.host_placeholder")}
                className="input-field w-full h-9 text-sm"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-muted-foreground mb-1.5">{t("moviepilot.port")}</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value === "" ? "" : parseInt(e.target.value) || 3000)}
                placeholder={t("moviepilot.port_placeholder")}
                className="input-field w-full h-9 text-sm no-spinner"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSsl}
                  onChange={(e) => setUseSsl(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-input accent-primary"
                />
                <span className="text-xs text-muted-foreground">{t("moviepilot.use_ssl")}</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t("moviepilot.api_token")}</label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={config?.configured ? "••••••••" : t("moviepilot.api_token_placeholder")}
              className="input-field w-full h-9 text-sm"
            />
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center gap-2">
            {config?.configured && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-ghost btn-sm gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 size={14} />
                {t("moviepilot.delete_config")}
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={handleVerify}
              disabled={verifying || !host || (!apiToken && !config?.configured)}
              className="btn btn-ghost btn-sm gap-1.5"
            >
              {verifying ? (
                <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
              ) : (
                <Network size={14} />
              )}
              {verifying ? t("moviepilot.verifying") : t("moviepilot.verify")}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !host || (!apiToken && !config?.configured)}
              className="btn btn-primary btn-sm gap-1.5"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-stream-spin" />
              ) : null}
              {saving ? t("moviepilot.saving") : t("moviepilot.save")}
            </button>
          </div>
        </div>
      </FadeContent>

      {/* ── Download Queue Section ── */}
      {config?.configured && (
        <FadeContent className="section-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <HardDrive size={16} className="text-primary" />
              {t("moviepilot.overview")}
            </h3>
            <button
              onClick={loadTorrents}
              disabled={loadingTorrents}
              className="btn btn-ghost btn-xs gap-1"
            >
              <Upload size={12} className={loadingTorrents ? "animate-stream-spin" : ""} />
            </button>
          </div>

          {loadingTorrents ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
              {t("common.loading")}
            </div>
          ) : torrents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Download size={24} className="text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">{t("moviepilot.no_torrents")}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Summary badges */}
              <div className="flex items-center gap-2 mb-2">
                {(() => {
                  const downloading = torrents.filter((t) => t.status === "downloading").length;
                  const seeding = torrents.filter((t) => t.status === "seeding").length;
                  return (
                    <>
                      {downloading > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          <Download size={10} />
                          {downloading} {t("moviepilot.downloading")}
                        </span>
                      )}
                      {seeding > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                          <Upload size={10} />
                          {seeding} {t("moviepilot.seeding")}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {t("moviepilot.torrent_count", { count: torrents.length })}
                      </span>
                    </>
                  );
                })()}
              </div>

              {/* Torrent list */}
              {torrents.map((tor) => (
                <div
                  key={tor.hash}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-xs font-medium ${getStatusColor(tor.status)}`}>
                      {tor.status === "downloading" ? <Download size={12} /> : <Upload size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{tor.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        {tor.status === "downloading" && (
                          <>
                            <span className="tabular-nums">{formatProgress(tor.progress)}</span>
                            <span className="tabular-nums">
                              {formatBytes(tor.downloaded)} / {formatBytes(tor.size)}
                            </span>
                            <span>{t("moviepilot.dl_speed")}: {formatSpeed(tor.dlspeed)}</span>
                          </>
                        )}
                        {tor.status === "seeding" && (
                          <>
                            <span>{formatBytes(tor.size)}</span>
                            <span>{t("moviepilot.ul_speed")}: {formatSpeed(tor.ulspeed)}</span>
                            <span>{t("moviepilot.seeders")}: {tor.seeders}</span>
                          </>
                        )}
                        {tor.status === "paused" && (
                          <span>{formatBytes(tor.size)}</span>
                        )}
                        {tor.status === "error" && (
                          <span className="flex items-center gap-1 text-red-500">
                            <AlertTriangle size={10} />
                            {t("moviepilot.error")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(tor.status)} bg-current/5`}
                  >
                    {getStatusLabel(tor.status, t)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </FadeContent>
      )}

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t("common.delete")}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("moviepilot.delete_confirm")}</p>
          <p className="text-xs text-muted-foreground/60">{t("moviepilot.delete_confirm_desc")}</p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={() => setShowDeleteConfirm(false)}
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
    </div>
  );
}
