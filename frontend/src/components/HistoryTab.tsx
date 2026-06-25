import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Recommendation, ExternalDetail, DBSessionDetail } from "../types";
import * as api from "../api";
import { useToast } from "../context/ToastContext";
import { TMDBDetailModal } from "./shared/TMDBDetailModal";
import { SessionList } from "./tabs/history/SessionList";
import { SessionDetail } from "./tabs/history/SessionDetail";

const PAGE_SIZE = 20;

export function HistoryTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<DBSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DBSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolvedPosters, setResolvedPosters] = useState<Record<number, string | null>>({});
  const [addingToWishlist, setAddingToWishlist] = useState<Record<number, boolean>>({});

  // TMDB detail modal
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const [detailData, setDetailData] = useState<ExternalDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [tmdbLoading, setTmdbLoading] = useState(false);

  const loadSessions = useCallback(async (p: number = 0) => {
    setLoading(true);
    try {
      const data = await api.listSessions({ page: p, page_size: PAGE_SIZE });
      setSessions(data.sessions);
      setTotal(data.total);
      setPage(p);
    } catch {
      showToast(t("history.detail_failed"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    loadSessions(0);
  }, [loadSessions]);

  const viewSession = useCallback(async (id: number) => {
    setDetailLoading(true);
    setDetail(null);
    setResolvedPosters({});
    try {
      const data = await api.getSessionDetail(id);
      setDetail(data);
      // Resolve posters for all recommendations in the background
      const posterMap: Record<number, string | null> = {};
      await Promise.allSettled(
        data.recommendations.map(async (rec, idx) => {
          try {
            const searchData = await api.searchMedia(rec.title, "tmdb");
            const matches = searchData.results ?? [];
            const yearMatch = rec.year
              ? matches.find((m) => m.year === rec.year && m.poster_url)
              : undefined;
            const fallback = matches.find((m) => m.poster_url);
            const match = yearMatch ?? fallback ?? matches[0];
            if (match?.poster_url) posterMap[idx] = match.poster_url;
          } catch { /* ignore */ }
        })
      );
      setResolvedPosters(posterMap);
    } catch {
      showToast(t("history.detail_failed"), "error");
    } finally {
      setDetailLoading(false);
    }
  }, [showToast, t]);

  const handleDeletedSession = useCallback((id: number) => {
    if (detail?.id === id) setDetail(null);
    loadSessions(page);
  }, [detail, page, loadSessions]);

  const addToWishlist = useCallback(async (rec: Recommendation, idx: number) => {
    if (addingToWishlist[idx]) return;
    setAddingToWishlist((prev) => ({ ...prev, [idx]: true }));
    try {
      await api.addToWishlist({ title: rec.title, year: rec.year, genre: rec.genre || null });
      showToast(t("wishlist.added_to_wishlist", { title: rec.title }), "success");
    } catch (err: any) {
      showToast(t("wishlist.add_failed", { message: err.message }), "error");
    } finally {
      setAddingToWishlist((prev) => ({ ...prev, [idx]: false }));
    }
  }, [addingToWishlist, showToast, t]);

  const openDetail = useCallback(async (rec: Recommendation) => {
    setDetailRec(rec);
    setDetailData(null);
    setDetailError("");
    setTmdbLoading(true);
    try {
      const searchData = await api.searchMedia(rec.title, "tmdb");
      const matches = searchData.results ?? [];
      const yearMatch = rec.year
        ? matches.find((m) => m.year === rec.year)
        : undefined;
      const match = yearMatch ?? matches[0];
      if (match?.source && match?.source_id) {
        const data = await api.getExternalDetail(match.source, match.source_id);
        setDetailData(data);
      } else {
        setDetailError(t("wishlist.search_empty", { query: rec.title }));
      }
    } catch (err: any) {
      setDetailError(err.message);
    } finally {
      setTmdbLoading(false);
    }
  }, [showToast, t]);

  const closeDetail = useCallback(() => {
    setDetailRec(null);
    setDetailData(null);
    setDetailError("");
  }, []);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      {!detail ? (
        <SessionList
          sessions={sessions}
          total={total}
          page={page}
          loading={loading}
          totalPages={totalPages}
          onLoadSessions={loadSessions}
          onViewSession={viewSession}
          onDeletedSession={handleDeletedSession}
          t={t}
        />
      ) : (
        <SessionDetail
          detail={detail}
          loading={detailLoading}
          resolvedPosters={resolvedPosters}
          addingToWishlist={addingToWishlist}
          onBack={() => { setDetail(null); setResolvedPosters({}); }}
          onAddToWishlist={addToWishlist}
          onOpenDetail={openDetail}
          t={t}
        />
      )}

      <TMDBDetailModal
        open={detailRec !== null}
        title={detailRec?.title}
        loading={tmdbLoading}
        error={detailError}
        data={detailData}
        tagline={detailData?.tagline}
        onClose={closeDetail}
        t={t}
      />
    </div>
  );
}
