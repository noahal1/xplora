import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getMPTorrents } from "../../api";
import type { MoviePilotTorrent } from "../../types";
import FadeContent from "../FadeContent";
import { formatBytes, formatSpeed, formatProgress, getStatusLabel, getStatusColor, getStatusBg } from "../../lib/utils";
import { Download, Upload, HardDrive, AlertTriangle, RefreshCw } from "lucide-react";

export function DownloadQueue() {
  const { t } = useTranslation();

  const [torrents, setTorrents] = useState<MoviePilotTorrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);

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
                {downloadingList.map((t) => (
                  <div key={t.hash} className="p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground tabular-nums flex-wrap">
                          <span>{formatProgress(t.progress)}</span>
                          <span>{formatBytes(t.downloaded)} / {formatBytes(t.size)}</span>
                          <span>{t("moviepilot.dl_speed")}: {formatSpeed(t.dlspeed)}</span>
                          <span>{t("moviepilot.ul_speed")}: {formatSpeed(t.ulspeed)}</span>
                        </div>
                      </div>
                      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(t.status)} ${getStatusBg(t.status)}`}>
                        {formatProgress(t.progress)}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 rounded-full bg-accent/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${Math.min(t.progress * 100, 100)}%` }}
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
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.seeders")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-muted-foreground bg-bg-canvas border-b border-border">{t("moviepilot.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seedingList.map((tor) => (
                      <tr key={tor.hash} className="hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2 text-xs truncate max-w-[200px]">{tor.name}</td>
                        <td className="px-3 py-2 text-[10px] tabular-nums text-right text-muted-foreground">{formatBytes(tor.size)}</td>
                        <td className="px-3 py-2 text-[10px] tabular-nums text-right text-muted-foreground">{formatSpeed(tor.ulspeed)}</td>
                        <td className="px-3 py-2 text-[10px] tabular-nums text-right text-muted-foreground">{tor.seeders}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(tor.status)} ${getStatusBg(tor.status)}`}>
                            {getStatusLabel(tor.status, t)}
                          </span>
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
                      <span className="text-xs truncate">{tor.name}</span>
                    </div>
                    <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${getStatusColor(tor.status)} ${getStatusBg(tor.status)}`}>
                      {getStatusLabel(tor.status, t)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </FadeContent>
  );
}
