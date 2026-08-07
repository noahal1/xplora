import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getMPTorrents, pauseMPTorrent, resumeMPTorrent, deleteMPTorrent } from "../../api";
import type { MoviePilotTorrent } from "../../types";
import FadeContent from "../FadeContent";
import { Modal } from "../Modal";
import { useToast } from "../../context/ToastContext";
import { getErrMsg, formatBytes, formatSpeed, formatProgress, formatEta, formatRatio, getStatusLabel, getStatusColor, getStatusBg } from "../../lib/utils";
import { Download, Upload, HardDrive, AlertTriangle, RefreshCw, Pause, Play, Trash2, Clock, ArrowUp, ArrowDown, TrendingUp } from "lucide-react";

export function DownloadQueue() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [torrents, setTorrents] = useState<MoviePilotTorrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  // hash → "pausing" | "resuming" | "deleting" — in-flight control action
  const [acting, setActing] = useState<Record<string, string>>({});
  // hash of the torrent awaiting delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MoviePilotTorrent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTorrents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMPTorrents();
      setTorrents(data.torrents);
      setConfigured(true);
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTorrents();
    // Refresh every 10 seconds
    const interval = setInterval(loadTorrents, 10000);
    return () => clearInterval(interval);
  }, [loadTorrents]);

  // ── Control actions ──

  const runAction = useCallback(async (tor: MoviePilotTorrent, action: "pause" | "resume") => {
    setActing((prev) => ({ ...prev, [tor.hash]: action }));
    try {
      const res = action === "pause"
        ? await pauseMPTorrent(tor.hash)
        : await resumeMPTorrent(tor.hash);
      if (res.success) {
        showToast(t(action === "pause" ? "moviepilot.action_paused" : "moviepilot.action_resumed"), "success");
      } else {
        showToast(t("moviepilot.action_failed", { message: res.message || t("moviepilot.unknown_error") }), "error");
      }
      loadTorrents();
    } catch (err) {
      showToast(t("moviepilot.action_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setActing((prev) => { const next = { ...prev }; delete next[tor.hash]; return next; });
    }
  }, [loadTorrents, showToast, t]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteMPTorrent(deleteTarget.hash);
      if (res.success) {
        showToast(t("moviepilot.action_deleted"), "success");
      } else {
        showToast(t("moviepilot.action_failed", { message: res.message || t("moviepilot.unknown_error") }), "error");
      }
      setDeleteTarget(null);
      loadTorrents();
    } catch (err) {
      showToast(t("moviepilot.action_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, loadTorrents, showToast, t]);

  // ── Render ──

  if (loading && configured === null) {
    return (
      <FadeContent className="section-card">
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
        </div>
      </FadeContent>
    );
  }

  if (configured === false) {
    return (
      <FadeContent className="section-card">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Download size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t("moviepilot.not_configured")}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t("moviepilot.not_configured_hint")}</p>
        </div>
      </FadeContent>
    );
  }

  // ── Summary stats ──

  const downloadingCount = torrents.filter((t) => t.status === "downloading").length;
  const seedingCount = torrents.filter((t) => t.status === "seeding").length;
  const errorCount = torrents.filter((t) => t.status === "error").length;

  const downloadingList = torrents.filter((t) => t.status === "downloading");
  const seedingList = torrents.filter((t) => t.status === "seeding");
  const otherList = torrents.filter((t) => t.status !== "downloading" && t.status !== "seeding");

  return (
    <FadeContent className="section-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="section-title flex items-center gap-2 text-base">
            <HardDrive size={16} className="text-primary shrink-0" />
            <span>{t("moviepilot.overview")}</span>
          </h2>
          <span className="badge font-mono text-xs shrink-0">
            {t("moviepilot.torrent_count", { count: torrents.length })}
          </span>
        </div>
        <button
          onClick={loadTorrents}
          disabled={loading}
          className="btn btn-ghost btn-xs gap-1"
        >
          <RefreshCw size={12} className={loading ? "animate-stream-spin" : ""} />
          {t("manage.refresh")}
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-2 mb-4">
        {downloadingCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Download size={10} />
            {downloadingCount} {t("moviepilot.downloading")}
          </span>
        )}
        {seedingCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
            <Upload size={10} />
            {seedingCount} {t("moviepilot.seeding")}
          </span>
        )}
        {errorCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle size={10} />
            {errorCount} {t("moviepilot.error")}
          </span>
        )}
      </div>

      {torrents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Download size={24} className="text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">{t("moviepilot.no_torrents")}</p>
        </div>
      ) : (
        <>
          {/* Downloading section */}
          {downloadingList.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Download size={12} className="text-blue-500" />
                {t("moviepilot.downloading")} ({downloadingList.length})
              </h3>
              <div className="space-y-2">
                {downloadingList.map((tor) => (
                  <div key={tor.hash} className="p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" title={tor.name}>{tor.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground tabular-nums flex-wrap">
                          <span>{formatProgress(tor.progress)}</span>
                          <span>{formatBytes(tor.downloaded)} / {formatBytes(tor.size)}</span>
                          <span className="inline-flex items-center gap-1"><ArrowDown size={10} className="text-blue-500" />{formatSpeed(tor.dlspeed)}</span>
                          <span className="inline-flex items-center gap-1"><ArrowUp size={10} className="text-green-500" />{formatSpeed(tor.ulspeed)}</span>
                          <span className="inline-flex items-center gap-1"><Clock size={10} />{t("moviepilot.eta")} {formatEta(tor.eta)}</span>
                          <span className="inline-flex items-center gap-1"><TrendingUp size={10} />{t("moviepilot.ratio")} {formatRatio(tor.ratio)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => runAction(tor, "pause")}
                          disabled={!!acting[tor.hash]}
                          className="btn btn-ghost btn-xs p-1"
                          title={t("moviepilot.pause")}
                        >
                          {acting[tor.hash] === "pausing" ? <RefreshCw size={12} className="animate-stream-spin" /> : <Pause size={12} />}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(tor)}
                          disabled={!!acting[tor.hash]}
                          className="btn btn-ghost btn-xs p-1 text-destructive hover:text-destructive"
                          title={t("common.delete")}
                        >
                          <Trash2 size={12} />
                        </button>
                        <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(tor.status)} ${getStatusBg(tor.status)}`}>
                          {formatProgress(tor.progress)}
                        </span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 rounded-full bg-accent/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${Math.min(tor.progress * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seeding section */}
          {seedingList.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Upload size={12} className="text-green-500" />
                {t("moviepilot.seeding")} ({seedingList.length})
              </h3>
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10">
                      <th className="px-3 py-2 text-left font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.name")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.size")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.ul_speed")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.ratio")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.seeders")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.status")}</th>
                      <th className="px-2 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("manage.col_actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seedingList.map((tor) => (
                      <tr key={tor.hash} className="hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2 text-xs truncate max-w-[200px]" title={tor.name}>{tor.name}</td>
                        <td className="px-3 py-2 text-[10px] tabular-nums text-right text-muted-foreground">{formatBytes(tor.size)}</td>
                        <td className="px-3 py-2 text-[10px] tabular-nums text-right text-muted-foreground">{formatSpeed(tor.ulspeed)}</td>
                        <td className="px-3 py-2 text-[10px] tabular-nums text-right text-muted-foreground">{formatRatio(tor.ratio)}</td>
                        <td className="px-3 py-2 text-[10px] tabular-nums text-right text-muted-foreground">{tor.seeders}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(tor.status)} ${getStatusBg(tor.status)}`}>
                            {getStatusLabel(tor.status, t)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => runAction(tor, "pause")}
                              disabled={!!acting[tor.hash]}
                              className="btn btn-ghost btn-xs p-1"
                              title={t("moviepilot.pause")}
                            >
                              {acting[tor.hash] === "pausing" ? <RefreshCw size={12} className="animate-stream-spin" /> : <Pause size={12} />}
                            </button>
                            <button
                              onClick={() => setDeleteTarget(tor)}
                              disabled={!!acting[tor.hash]}
                              className="btn btn-ghost btn-xs p-1 text-destructive hover:text-destructive"
                              title={t("common.delete")}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Other section (paused/error) */}
          {otherList.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">{t("moviepilot.other")} ({otherList.length})</h3>
              <div className="space-y-1.5">
                {otherList.map((tor) => (
                  <div key={tor.hash} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-xs ${getStatusColor(tor.status)}`}>
                        {tor.status === "error" ? <AlertTriangle size={12} /> : <Download size={12} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate" title={tor.name}>{tor.name}</p>
                        {tor.status === "paused" && (
                          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                            {formatBytes(tor.size)} · {formatProgress(tor.progress)} · {t("moviepilot.ratio")} {formatRatio(tor.ratio)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {tor.status === "paused" && (
                        <button
                          onClick={() => runAction(tor, "resume")}
                          disabled={!!acting[tor.hash]}
                          className="btn btn-ghost btn-xs p-1"
                          title={t("moviepilot.resume")}
                        >
                          {acting[tor.hash] === "resuming" ? <RefreshCw size={12} className="animate-stream-spin" /> : <Play size={12} />}
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(tor)}
                        disabled={!!acting[tor.hash]}
                        className="btn btn-ghost btn-xs p-1 text-destructive hover:text-destructive"
                        title={t("common.delete")}
                      >
                        <Trash2 size={12} />
                      </button>
                      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(tor.status)} ${getStatusBg(tor.status)}`}>
                        {getStatusLabel(tor.status, t)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Delete confirmation modal ── */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        title={t("moviepilot.delete_torrent_title")}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("moviepilot.delete_torrent_desc", { name: deleteTarget?.name || "" })}
          </p>
          {deleteTarget && (
            <div className="p-3 rounded-lg border border-border bg-accent/20">
              <p className="text-xs font-medium truncate">{deleteTarget.name}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums mt-1">
                {formatBytes(deleteTarget.size)} · {formatProgress(deleteTarget.progress)} · {t("moviepilot.ratio")} {formatRatio(deleteTarget.ratio)}
              </p>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="btn btn-ghost btn-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="btn btn-sm bg-destructive text-white"
              style={{ borderColor: "transparent" }}
            >
              {deleting ? <RefreshCw size={12} className="animate-stream-spin" /> : <Trash2 size={12} />}
              {t("common.delete")}
            </button>
          </div>
        </div>
      </Modal>
    </FadeContent>
  );
}
