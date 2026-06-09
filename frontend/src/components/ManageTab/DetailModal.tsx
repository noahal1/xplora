import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { MediaDetail } from "../../types";
import { Badge } from "../ui/badge";
import { Modal } from "../Modal";
import { ProgressiveImage } from "../ProgressiveImage";
import { Film, Sparkles, Pencil, X, Loader2 } from "lucide-react";
import * as api from "../../api";
import { useToast } from "../../context/ToastContext";
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
        overview: movie.overview ?? "",
        director: movie.director ?? "",
        actors: movie.actors ?? "",
        country: movie.country ?? "",
        awards: movie.awards ?? "",
        tagline: movie.tagline ?? "",
        runtime: movie.runtime,
        media_type: movie.media_type || "movie",
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
      const updated = await api.updateMedia(movie.id, {
        title: movie.title,
        rating: movie.rating,
        year: movie.year,
        genre: movie.genre,
        media_type: form.media_type || "movie",
        // Clear TV-specific fields when switching to movie
        tv_series_id: isMovie ? null : movie.tv_series_id,
        season_number: isMovie ? null : movie.season_number,
        episode_count: isMovie ? null : movie.episode_count,
        series_poster_url: isMovie ? null : movie.series_poster_url,
        overview: form.overview || null,
        director: form.director || null,
        actors: form.actors || null,
        country: form.country || null,
        awards: form.awards || null,
        tagline: form.tagline || null,
        runtime: form.runtime != null ? form.runtime : null,
      });
      // Merge updated fields into local form and movie for immediate feedback
      setForm({
        overview: updated.overview ?? "",
        director: updated.director ?? "",
        actors: updated.actors ?? "",
        country: updated.country ?? "",
        awards: updated.awards ?? "",
        tagline: updated.tagline ?? "",
        runtime: updated.runtime,
        media_type: updated.media_type || "movie",
      });
      // Optimistically update the movie object so view mode shows new data immediately
      Object.assign(movie, {
        overview: updated.overview,
        director: updated.director,
        actors: updated.actors,
        country: updated.country,
        awards: updated.awards,
        tagline: updated.tagline,
        runtime: updated.runtime,
        media_type: updated.media_type,
      });
      // onSave triggers fetchData in ManageTab to refresh from server
      showToast(t("manage.updated"), "success");
      onSave?.();
      setEditing(false);
    } catch (err: any) {
      showToast(t("manage.save_failed", { message: err.message }), "error");
    } finally {
      setSaving(false);
    }
  }, [movie, form, showToast, t]);

  const startEditing = useCallback(() => {
    if (!movie) return;      setForm({
        overview: movie.overview ?? "",
        director: movie.director ?? "",
        actors: movie.actors ?? "",
        country: movie.country ?? "",
        awards: movie.awards ?? "",
        tagline: movie.tagline ?? "",
        runtime: movie.runtime,
        media_type: movie.media_type || "movie",
      });
      setEditing(true);
    }, [movie]);

  if (!movie) return null;

  const descParts = [];
  if (movie.year) descParts.push(movie.year);
  if (movie.genre) descParts.push(translateGenres(movie.genre));
  if (movie.runtime) descParts.push(`${movie.runtime} ${t("detail_modal.minutes")}`);
  const description = descParts.join(" · ");

  return (
    <Modal open={open} onClose={handleClose}
      title={editing ? t("detail_modal.edit_title") : movie.title}
      description={editing ? undefined : description}
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
        /* ── Edit Mode ──────────────────────────────────── */
        <div className="space-y-4">
          {/* ── Media Type Toggle ──────────────────────── */}
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">{t("manage.media_type")}</p>
            <div className="flex gap-1.5">
              {[{ value: "movie", label: t("manage.media_type_movie") }, { value: "tv", label: t("manage.media_type_tv") }].map((opt) => (
                <button key={opt.value} type="button"
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
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
            <textarea className="input-field w-full h-24 text-sm px-3 py-2 resize-y leading-relaxed"
              value={form.overview ?? ""}
              onChange={(e) => setForm(f => ({ ...f, overview: e.target.value }))} />
          </EditField>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <EditField label={t("detail_modal.director")}>
              <input type="text" className="input-field w-full text-sm px-3 py-2"
                value={form.director ?? ""}
                onChange={(e) => setForm(f => ({ ...f, director: e.target.value }))} />
            </EditField>
            <EditField label={t("detail_modal.country")}>
              <input type="text" className="input-field w-full text-sm px-3 py-2"
                value={form.country ?? ""}
                onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} />
            </EditField>
            <EditField label={t("detail_modal.actors")} className="col-span-2">
              <input type="text" className="input-field w-full text-sm px-3 py-2"
                value={form.actors ?? ""}
                onChange={(e) => setForm(f => ({ ...f, actors: e.target.value }))} />
            </EditField>
            <EditField label={t("detail_modal.awards")} className="col-span-2">
              <input type="text" className="input-field w-full text-sm px-3 py-2"
                value={form.awards ?? ""}
                onChange={(e) => setForm(f => ({ ...f, awards: e.target.value }))} />
            </EditField>
            <EditField label={t("detail_modal.runtime")}>
              <input type="number" className="input-field w-full text-sm px-3 py-2 no-spinner"
                value={form.runtime ?? ""}
                onChange={(e) => setForm(f => ({ ...f, runtime: e.target.value ? parseInt(e.target.value) : null }))}
                min={0} placeholder={t("detail_modal.minutes")} />
            </EditField>
            <EditField label={t("detail_modal.tagline")}>
              <input type="text" className="input-field w-full text-sm px-3 py-2"
                value={form.tagline ?? ""}
                onChange={(e) => setForm(f => ({ ...f, tagline: e.target.value }))} />
            </EditField>
          </div>
        </div>
      ) : (
        /* ── View Mode (existing) ────────────────────────── */
        <div className="space-y-5">
          <div className="flex gap-4">
            <div className="w-[100px] h-[140px] shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center"
              style={{ border: "1px solid var(--border-subtle)" }}>
              {movie.poster_url ? (
                <ProgressiveImage src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
              ) : <Film size={28} className="text-muted-foreground/30" />}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {movie.overview ? (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.overview")}</p>
                  <p className="text-sm leading-relaxed line-clamp-4">{movie.overview}</p>
                </div>
              ) : <p className="text-sm text-muted-foreground italic">{t("detail_modal.no_overview")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {movie.director && (
              <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.director")}</p><p className="text-sm">{movie.director}</p></>
            )}
            {movie.actors && (
              <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.actors")}</p><p className="text-sm line-clamp-2">{movie.actors}</p></>
            )}
            {movie.country && (
              <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.country")}</p><p className="text-sm">{movie.country}</p></>
            )}
            {movie.awards && (
              <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.awards")}</p><p className="text-sm line-clamp-2">{movie.awards}</p></>
            )}
            {movie.runtime && (
              <><p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.runtime")}</p><p className="text-sm">{movie.runtime} {t("detail_modal.minutes")}</p></>
            )}
            {movie.tagline && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">{t("detail_modal.tagline")}</p>
                <p className="text-sm italic">"{movie.tagline}"</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {movie.imdb_id && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 8.5h2v7h-2zm5.5 0h2v7h-2zm5.5-3.5h2v10.5h-2zM4 5.5h2v11H4z"/></svg>
                {movie.imdb_id}
              </Badge>
            )}
            {movie.tmdb_id && <Badge variant="outline" className="text-[10px]">TMDB: {movie.tmdb_id}</Badge>}
            {movie.poster_url ? (
              <Badge variant="outline" className="text-[10px] text-green gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>
                {t("manage.metadata_complete")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-amber gap-1">
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
