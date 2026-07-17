import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import { Badge } from "../ui/badge";
import { Modal } from "../Modal";
import { ProgressiveImage } from "../ProgressiveImage";
import { Film, Sparkles, Pencil, X, Loader2 } from "lucide-react";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
import { getErrMsg } from "../../lib/utils";
import { translateGenres } from "../../utils/genre";

interface DetailModalProps {
  open: boolean;
  movie: MediaDetail | null;
  onClose: () => void;
  onSave?: () => void;
}

export function DetailModal({ open, movie, onClose, onSave }: DetailModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const prevMovieIdRef = useRef<number | null>(null);

  // Local edit state initialised from movie prop
  const [form, setForm] = useState<Partial<MediaDetail>>({});

  // Initialise form whenever the modal opens with a (new) movie
  useEffect(() => {
    if (open && movie && movie.id !== prevMovieIdRef.current) {
      prevMovieIdRef.current = movie.id;
      setForm({
        title: movie.title,
        overview: movie.overview ?? "",
        country: movie.country ?? "",
        tagline: movie.tagline ?? "",
        runtime: movie.runtime,
        year: movie.year,
        media_type: movie.media_type || "movie",
        episode_count: movie.episode_count,
      });
    }
  }, [open, movie]);

  const handleClose = useCallback(() => {
    setEditing(false);
    setForm({});
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!movie) return;
    setSaving(true);
    try {
      const isMovie = form.media_type === "movie";
      const updatedTitle = (form.title || "").trim();
      if (!updatedTitle) { showToast(t("manage.title_required", "标题不能为空"), "error"); return; }
      const updated = await api.updateMedia(movie.id, {
        title: updatedTitle,
        rating: movie.rating,
        year: form.year !== undefined ? form.year : movie.year,
        genre: movie.genre,
        media_type: form.media_type || "movie",
        // Clear TV-specific fields when switching to movie
        tv_series_id: isMovie ? null : movie.tv_series_id,
        season_number: isMovie ? null : movie.season_number,
        episode_count: isMovie ? null : (form.episode_count ?? movie.episode_count),
        series_poster_url: isMovie ? null : movie.series_poster_url,
        overview: form.overview || null,
        country: form.country || null,
        tagline: form.tagline || null,
        runtime: form.runtime != null ? form.runtime : null,
      });
      // Merge updated fields into local form and movie for immediate feedback
      setForm({
        title: updated.title,
        overview: updated.overview ?? "",
        country: updated.country ?? "",
        tagline: updated.tagline ?? "",
        runtime: updated.runtime,
        year: updated.year,
        media_type: updated.media_type || "movie",
        episode_count: updated.episode_count,
      });
      // Optimistically update the movie object so view mode shows new data immediately
      Object.assign(movie, {
        title: updated.title,
        overview: updated.overview,
        country: updated.country,
        tagline: updated.tagline,
        runtime: updated.runtime,
        media_type: updated.media_type,
        episode_count: updated.episode_count,
      });
      // onSave triggers fetchData in ManageTab to refresh from server
      showToast(t("manage.updated"), "success");
      onSave?.();
      setEditing(false);
    } catch (err: unknown) {
      showToast(t("manage.save_failed", { message: getErrMsg(err) }), "error");
    } finally {
      setSaving(false);
    }
  }, [movie, form, showToast, t]);

  const startEditing = useCallback(() => {
    if (!movie) return;      setForm({
        title: movie.title,
        overview: movie.overview ?? "",
        country: movie.country ?? "",
        tagline: movie.tagline ?? "",
        runtime: movie.runtime,
        year: movie.year,
        media_type: movie.media_type || "movie",
        episode_count: movie.episode_count,
      });
      setEditing(true);
    }, [movie]);

  if (!movie) return null;

  return (
    <Modal open={open} onClose={handleClose}
      title={editing ? (form.title || t("detail_modal.edit_title")) : movie.title}
      description={undefined}
      footer={editing ? (
        <div className="flex items-center gap-2 w-full justify-end">
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            <X size={13} className="mr-1" />{t("common.cancel")}
          </button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {t("common.save")}
          </button>
        </div>
      ) : undefined}
    >
      {editing ? (
        /* ── Edit Mode (mobile-friendly) ──────────────────── */
        <div className="space-y-3 sm:space-y-4">
          {/* ── Title ────────────────────────────────── */}
          <EditField label={t("manage.col_title")}>
            <input type="text" className="input-field w-full text-sm px-3 py-2.5 sm:py-2 font-medium"
              value={form.title ?? ""}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={t("manage.col_title")} />
          </EditField>
          {/* ── Media Type Toggle ──────────────────────── */}
          <div>
            <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">{t("manage.media_type")}</p>
            <div className="flex gap-2 sm:gap-1.5">
              {[{ value: "movie", label: t("manage.media_type_movie") }, { value: "tv", label: t("manage.media_type_tv") }].map((opt) => (
                <button key={opt.value} type="button"
                  className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
                    form.media_type === opt.value
                      ? "bg-primary/10 text-primary border-primary/25 shadow-sm"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground hover:bg-accent/40"
                  }`}
                  onClick={() => setForm(f => ({ ...f, media_type: opt.value }))}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <EditField label={t("detail_modal.overview")}>
            <textarea className="input-field w-full h-28 sm:h-24 text-sm px-3 py-2.5 sm:py-2 resize-y leading-relaxed"
              value={form.overview ?? ""}
              onChange={(e) => setForm(f => ({ ...f, overview: e.target.value }))} />
          </EditField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 sm:gap-y-4">
              <EditField label={t("detail_modal.country")}>
              <input type="text" className="input-field w-full text-sm px-3 py-2.5 sm:py-2"
                value={form.country ?? ""}
                onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} />
            </EditField>
            <EditField label={t("detail_modal.runtime")}>
              <input type="number" className="input-field w-full text-sm px-3 py-2.5 sm:py-2 no-spinner"
                value={form.runtime ?? ""}
                onChange={(e) => setForm(f => ({ ...f, runtime: e.target.value ? parseInt(e.target.value) : null }))}
                min={0} placeholder={t("detail_modal.minutes")} />
            </EditField>
            <EditField label={t("manage.col_year")}>
              <input type="number" className="input-field w-full text-sm px-3 py-2.5 sm:py-2 no-spinner"
                value={form.year ?? ""}
                onChange={(e) => setForm(f => ({ ...f, year: e.target.value ? parseInt(e.target.value) : null }))}
                min={1888} max={2030} placeholder={t("manage.col_year")} />
            </EditField>
            {/* Episode count (TV only) */}
            {form.media_type === "tv" && (
              <EditField label={t("detail_modal.episode_count", "集数")}>
                <input type="number" className="input-field w-full text-sm px-3 py-2.5 sm:py-2 no-spinner"
                  value={form.episode_count ?? ""}
                  onChange={(e) => setForm(f => ({ ...f, episode_count: e.target.value ? parseInt(e.target.value) : null }))}
                  min={0} placeholder={t("detail_modal.episode_count_placeholder", "集数")} />
              </EditField>
            )}
            <EditField label={t("detail_modal.tagline")}>
              <input type="text" className="input-field w-full text-sm px-3 py-2.5 sm:py-2"
                value={form.tagline ?? ""}
                onChange={(e) => setForm(f => ({ ...f, tagline: e.target.value }))} />
            </EditField>
          </div>
        </div>
      ) : (
        /* ── View Mode (mobile-optimized) ─────────────── */
        <div className="space-y-4 sm:space-y-5">
          {/* Poster + key info — horizontal on mobile */}
          <div className="flex flex-row gap-3 sm:gap-4">
            <div className="w-[80px] sm:w-[100px] shrink-0">
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center border border-border/50 shadow-sm"
              >
                {movie.poster_url ? (
                  <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
                ) : <Film size={22} className="text-muted-foreground/30" />}
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {/* Quick info badges */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {movie.year && (
                  <span className="font-medium">{movie.year}</span>
                )}
                {movie.genre && (
                  <span className="line-clamp-2 max-w-[160px] sm:max-w-full opacity-70" title={translateGenres(movie.genre)}>{translateGenres(movie.genre)}</span>
                )}
                {movie.runtime && (
                  <span className="opacity-70">{movie.runtime} {t("detail_modal.minutes")}</span>
                )}
                {movie.media_type === "tv" && (
                  <Badge variant="outline" className="text-[9px] text-sky border-sky/30 bg-sky/5 leading-none px-1.5 py-0 shrink-0">TV</Badge>
                )}
              </div>

              {/* Episode count (TV only) */}
              {movie.media_type === "tv" && movie.episode_count != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("detail_modal.episode_count", "集数")}</span>
                  <span className="text-sm font-medium">{movie.episode_count}</span>
                </div>
              )}

              {/* Overview */}
              {movie.overview ? (
                <p className="text-xs sm:text-sm leading-relaxed line-clamp-3 sm:line-clamp-4 text-foreground/80">
                  {movie.overview}
                </p>
              ) : (
                <p className="text-xs sm:text-sm text-muted-foreground italic">{t("detail_modal.no_overview")}</p>
              )}
            </div>
          </div>

          {/* Metadata grid — 1 col on mobile, 2 col on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 sm:gap-y-3">
            {movie.country && (
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.country")}</p>
                <p className="text-sm">{movie.country}</p>
              </div>
            )}
            {movie.runtime && (
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.runtime")}</p>
                <p className="text-sm">{movie.runtime} {t("detail_modal.minutes")}</p>
              </div>
            )}
            {movie.tagline && (
              <div className="sm:col-span-2">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.tagline")}</p>
                <p className="text-sm italic">"{movie.tagline}"</p>
              </div>
            )}
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1">
            {movie.imdb_id && (
              <Badge variant="outline" className="text-[10px] gap-1 py-0.5">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 8.5h2v7h-2zm5.5 0h2v7h-2zm5.5-3.5h2v10.5h-2zM4 5.5h2v11H4z"/></svg>
                {movie.imdb_id}
              </Badge>
            )}
            {movie.tmdb_id && <Badge variant="outline" className="text-[10px] py-0.5">TMDB: {movie.tmdb_id}</Badge>}
            {movie.poster_url ? (
              <Badge variant="outline" className="text-[10px] text-green gap-1 py-0.5">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>
                {t("manage.metadata_complete")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-amber gap-1 py-0.5">
                <Sparkles size={10} />{t("manage.enrich_hint")}
              </Badge>
            )}
          </div>

          {/* ── Edit Button ─────────────────────────────── */}
          <div className="flex justify-end pt-1">
            <button className="btn btn-ghost btn-sm gap-1.5" onClick={startEditing}>
              <Pencil size={13} />
              {t("common.edit")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Small helper for edit field groups ──────────────────────── */
function EditField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}
