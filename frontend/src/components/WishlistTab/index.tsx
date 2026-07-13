import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { WishlistItem, SortField } from "../../types";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { Pagination } from "../Pagination";
import { DetailModal } from "../ManageTab/DetailModal";
import CountUp from "../CountUp";
import { MediaTypeFilter } from "../MediaTypeFilter";
import { CountryFilter } from "../CountryFilter";
import { SortControls } from "../SortControls";
import { SearchInput } from "../SearchInput";
import { FilterBar } from "../shared/FilterBar";
import { useDebouncedSearch } from "../../hooks/useDebouncedSearch";
import { usePagination } from "../../hooks/usePagination";
import { useSort } from "../../hooks/useSort";
import { useEnrichReload } from "../../hooks/useEnrichReload";
import { getErrMsg, isAbortError } from "../../lib/utils";

import FadeContent from "../FadeContent";
import { EmptyState } from "../EmptyState";
import { WishlistRatingModal } from "./RatingModal";
import { WishlistMobileCard } from "../tabs/wishlist/WishlistMobileCard";
import { WishlistDesktopRow } from "../tabs/wishlist/WishlistDesktopRow";
import { WishlistSearchModal } from "../tabs/wishlist/WishlistSearchModal";
import { WishlistAddModal } from "../tabs/wishlist/WishlistAddModal";

export interface WishlistEntry {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  media_type?: string;
  season_number?: number | null;
  episode_count?: number | null;
  poster_url?: string | null;
  overview?: string | null;
  runtime?: number | null;
  imdb_id?: string | null;
  tmdb_id?: string | null;
  country?: string | null;
  tagline?: string | null;
  series_poster_url?: string | null;
}

const PAGE_SIZE = 16;

export function WishlistTab() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // ── Wishlist data ──
  const [items, setItems] = useState<WishlistEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set());
  const [filterCountries, setFilterCountries] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    api.getMediaFilters().then((data) => {
      if (!cancelled) setFilterCountries(data.countries);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [loading, setLoading] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const filter = useDebouncedSearch("", 300);
  const { field: sortField, dir: sortDir, toggle: handleSortToggle } = useSort("created_at", "desc");
  const { page: currentPage, setPage: setCurrentPage, totalPages } = usePagination(total, PAGE_SIZE);

  // === Mark-as-watched modal ===
  const [markingMovie, setMarkingMovie] = useState<WishlistEntry | null>(null);

  // === Modals ===
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // === Saved item detail modal ===
  const [detailSaved, setDetailSaved] = useState<WishlistEntry | null>(null);

  // Compute existing titles for dedup in search modal
  const existingTitles = items.map((m) => m.title);

  // ── Load wishlist from API ──

  const loadWishlist = useCallback(async (page: number, search: string, sortF: string, sortD: string, mediaType: string, country: Set<string>, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await api.listMedia({
        page,
        page_size: PAGE_SIZE,
        status: "wish",
        search: search || undefined,
        sort_field: sortF,
        sort_dir: sortD,
        media_type: (mediaType !== "all" ? mediaType : undefined),
        country: (country.size > 0 ? Array.from(country).join(",") : undefined),
        signal,
      });
      if (signal?.aborted) return;
      setItems(data.media.map((m) => ({ id: m.id, title: m.title, year: m.year, genre: m.genre, media_type: m.media_type, poster_url: m.poster_url, overview: m.overview, runtime: m.runtime, imdb_id: m.imdb_id, tmdb_id: m.tmdb_id, country: m.country, tagline: m.tagline, series_poster_url: m.series_poster_url, season_number: m.season_number, episode_count: m.episode_count })));
      setTotal(data.total);
    } catch (err: unknown) {
      if (isAbortError(err)) return;
    }
    finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadWishlist(currentPage, filter.debouncedValue, sortField, sortDir, mediaTypeFilter, countryFilter, controller.signal);
    return () => controller.abort();
  }, [currentPage, filter.debouncedValue, sortField, sortDir, mediaTypeFilter, countryFilter, reloadTrigger, loadWishlist]);



  // Auto-refresh when background enrichment completes
  useEnrichReload(() => setReloadTrigger((n) => n + 1));

  const refreshWishlist = useCallback(() => { setCurrentPage(0); filter.clear(); setReloadTrigger((n) => n + 1); }, []);

  // ================================
  // Wishlist operations
  // ================================

  const deleteItem = useCallback(async (id: number) => {
    try {
      await api.deleteMedia(id);
      showToast(t("wishlist.delete_success"), "success");
      const willBeEmpty = items.length <= 1;
      if (willBeEmpty && currentPage > 0) setCurrentPage((p) => p - 1);
      else setReloadTrigger((n) => n + 1);
    } catch (err: unknown) { showToast(t("wishlist.delete_failed", { message: getErrMsg(err) }), "error"); }
  }, [items.length, currentPage, showToast, t]);

  const confirmMarkAsWatched = useCallback(async (movieId: number, rating: number) => {
    try {
      await api.markMediaAsWatched(movieId, rating);
      setMarkingMovie(null);
      showToast(t("wishlist.marked_as_watched", { title: items.find(m => m.id === movieId)?.title || "", rating: rating.toFixed(1) }), "success");
      const willBeEmpty = items.length <= 1;
      if (willBeEmpty && currentPage > 0) setCurrentPage((p) => p - 1);
      else setReloadTrigger((n) => n + 1);
    } catch (err: unknown) { showToast(t("wishlist.mark_failed", { message: getErrMsg(err) }), "error"); }
  }, [items, currentPage, showToast, t]);

  return (
    <div className="space-y-5">

      {/* === Wishlist Section === */}
      {(total > 0 || filter.debouncedValue || mediaTypeFilter !== "all" || loading) && (
        <FadeContent className="section-card animate-slide-down">
          <div className="section-header flex-wrap gap-2 sm:flex-nowrap">
            <h2 className="section-title flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              {t("wishlist.title")}
            </h2>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-sm:pb-1 max-sm:-mb-1">
              <button
                onClick={() => setSearchModalOpen(true)}
                className="btn btn-ghost btn-xs shrink-0"
                title={t("wishlist.search_movies")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <span className="hidden sm:inline">{t("wishlist.search_movies")}</span>
              </button>
              <button
                onClick={() => setAddModalOpen(true)}
                className="btn btn-ghost btn-xs shrink-0"
                title={t("wishlist.manual_add")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span className="hidden sm:inline">{t("wishlist.manual_add")}</span>
              </button>
              <span className="badge font-mono text-xs shrink-0">{t("wishlist.movie_count").split("{{count}}")[0]}<CountUp end={total} />{t("wishlist.movie_count").split("{{count}}")[1]}</span>
            </div>
          </div>
          <SearchInput
            value={filter.input}
            onChange={filter.setInput}
            onClear={() => { filter.clear(); setMediaTypeFilter("all"); setCurrentPage(0); }}
            placeholder={t("wishlist.filter_placeholder")}
            showClear={!!filter.debouncedValue}
            className="mb-2"
            id="wishlist-filter"
          />
          <FilterBar
            collapseLabel={t("manage.filter_collapse")}
            expandLabel={t("manage.filter_expand")}
          >
            <div className="flex flex-col gap-0 sm:gap-0">
              <div className="flex items-start sm:items-center gap-0 sm:gap-0 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar">
                <SortControls
                  field={sortField}
                  dir={sortDir}
                  onSort={(f) => { handleSortToggle(f); setCurrentPage(0); }}
                />
                <MediaTypeFilter
                  selected={mediaTypeFilter}
                  onSelect={(v) => { setMediaTypeFilter(v); setCurrentPage(0); }}
                />
              </div>
              <CountryFilter
                countries={filterCountries}
                selected={countryFilter}
                onSelect={(c) => { setCountryFilter(c); setCurrentPage(0); }}
              />
              {countryFilter.size > 0 && (
                <div className="flex items-center gap-1 mb-2 sm:mb-3">
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => { setCountryFilter(new Set()); setCurrentPage(0); }}
                  >
                    {t("manage.clear_filter")}
                  </button>
                </div>
              )}
            </div>
          </FilterBar>
          {loading ? (
            <div className="flex items-center justify-center py-10"><div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" /></div>
          ) : (
            <>
                {items.length === 0 && (filter.debouncedValue || mediaTypeFilter !== "all") ? (
                  <EmptyState
                    hasActiveFilters
                    searchQuery={filter.debouncedValue}
                    onClearFilters={() => {
                      filter.clear();
                      setMediaTypeFilter("all");
                      setCurrentPage(0);
                    }}
                    noMatchKey={filter.debouncedValue ? "wishlist.no_matching" : "watched.no_match"}
                    noDataKey="wishlist.no_items"
                  />
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2.5">
                      {items.map((m) => (
                        <WishlistMobileCard
                          key={m.id}
                          item={m}
                          onMarkWatched={setMarkingMovie}
                          onDelete={deleteItem}
                          onOpenDetail={setDetailSaved}
                        />
                      ))}
                    </div>
                    {/* Desktop cards */}
                    <div className="max-sm:hidden space-y-1.5">
                      {items.map((m) => (
                        <WishlistDesktopRow
                          key={m.id}
                          item={m}
                          onMarkWatched={setMarkingMovie}
                          onDelete={deleteItem}
                          onOpenDetail={setDetailSaved}
                        />
                      ))}
                    </div>
                  </>)}
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} info={t("watched.total_movies", { count: total })} />
            </>
          )}
        </FadeContent>
      )}

      {/* === Search Modal === */}
      <WishlistSearchModal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onAddSuccess={refreshWishlist}
        existingTitles={existingTitles}
      />

      {/* === Add Movie Modal === */}
      <WishlistAddModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddSuccess={refreshWishlist}
      />

      {/* === Saved Item Detail Modal === */}
      {detailSaved && (
        <DetailModal
          open={detailSaved !== null}
          movie={{
            id: detailSaved.id,
            title: detailSaved.title,
            rating: 0,
            year: detailSaved.year,
            genre: detailSaved.genre,
            status: "wish",
            media_type: detailSaved.media_type || "movie",
            poster_url: detailSaved.poster_url ?? null,
            overview: detailSaved.overview ?? null,

            runtime: detailSaved.runtime ?? null,
            imdb_id: detailSaved.imdb_id ?? null,
            tmdb_id: detailSaved.tmdb_id ?? null,
            country: detailSaved.country ?? null,
            tagline: detailSaved.tagline ?? null,
            scrape_error: null,
            tv_series_id: null,
            season_number: detailSaved.season_number ?? null,
            episode_count: detailSaved.episode_count ?? null,
            series_poster_url: detailSaved.series_poster_url ?? null,
            created_at: "",
          }}
          onClose={() => setDetailSaved(null)}
        />
      )}

      {/* === Rating Modal === */}
      <WishlistRatingModal open={markingMovie !== null} movie={markingMovie} onClose={() => setMarkingMovie(null)} onConfirm={confirmMarkAsWatched} />

      {/* Empty State (no items, no filters) */}
      {total === 0 && !filter.debouncedValue && mediaTypeFilter === "all" && !loading && (
        <FadeContent className="section-card">
          <EmptyState
            icon={
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            }
            noDataKey="wishlist.no_items"
            noDataSubtextKey="wishlist.no_items_hint"
            noDataActions={
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setSearchModalOpen(true)}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  {t("wishlist.search_movies")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddModalOpen(true)}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {t("wishlist.manual_add")}
                </button>
              </div>
            }
          />
        </FadeContent>
      )}
    </div>
  );
}
