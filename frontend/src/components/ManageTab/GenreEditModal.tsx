import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DBMovie } from "../../types";
import { Modal } from "../Modal";
import { GenreInput } from "../GenreInput";
import { Film } from "lucide-react";

interface GenreEditModalProps {
  open: boolean;
  movie: DBMovie | null;
  onClose: () => void;
  onSave: (movieId: number, genre: string) => Promise<void>;
}

const QUICK_GENRES = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Romance", "Thriller", "Animation", "Documentary", "Fantasy", "Mystery", "Crime"];

export function GenreEditModal({ open, movie, onClose, onSave }: GenreEditModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  // Reset value when modal opens with a new movie
  useEffect(() => {
    if (open && movie) setValue(movie.genre || "");
  }, [open, movie]);

  const handleGenreClick = (genre: string) => {
    const currentGenres = value.split(" / ").map((s) => s.trim()).filter(Boolean);
    if (currentGenres.includes(genre)) {
      setValue(currentGenres.filter((g) => g !== genre).join(" / "));
    } else {
      currentGenres.push(genre);
      setValue(currentGenres.join(" / "));
    }
  };

  const handleSave = async () => {
    if (!movie) return;
    await onSave(movie.id, value.trim() || "");
    onClose();
  };

  // Safely check this render cycle
  const currentMovie = movie;

  return (
    <Modal open={open} onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" /><path d="M14 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0" /><path d="M17 14v4" /><path d="M20 17h-6" />
          </svg>
          {t("manage.genre_edit_title")}
        </span>
      }
      description={currentMovie ? t("manage.genre_edit_desc", { title: currentMovie.title }) : ""}
      footer={
        <div className="flex items-center gap-2 w-full justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={handleSave}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            {t("common.save")}
          </button>
        </div>
      }
    >
      {currentMovie && (
        <div className="space-y-4">
          {/* Current movie info */}
          <div className="relative flex items-center gap-4 p-3.5 rounded-xl bg-gradient-to-r from-primary/[0.04] to-primary/[0.01] border border-primary/10">
            <div className="w-11 h-16 rounded-lg shrink-0 overflow-hidden bg-muted flex items-center justify-center shadow-sm"
              style={{ border: "1px solid var(--border-subtle)" }}>
              {currentMovie.poster_url ? (
                <img src={currentMovie.poster_url} alt={currentMovie.title} className="w-full h-full object-cover" loading="lazy" />
              ) : <Film size={16} className="text-muted-foreground/30" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{currentMovie.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{currentMovie.year ? `${currentMovie.year}` : ""}</p>
              {currentMovie.genre ? (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {currentMovie.genre.split(" / ").map((g) => (
                    <span key={g} className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/8 px-1.5 py-0.5 rounded-full border border-primary/15">{g.trim()}</span>
                  ))}
                </div>
              ) : (
                <span className="inline-flex items-center text-[10px] text-muted-foreground/60 mt-1.5 italic">{t("manage.genre_not_set")}</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* Quick-genre chips */}
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">{t("genre_input.quick_select", "快速选择")}</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_GENRES.map((genre) => {
                  const isSelected = value.split(" / ").map((s) => s.trim()).includes(genre);
                  return (
                    <button key={genre} type="button" onClick={() => handleGenreClick(genre)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 border ${
                        isSelected ? "bg-primary/10 text-primary border-primary/25 shadow-sm"
                          : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground hover:bg-accent/40"
                      }`}>{genre}</button>
                  );
                })}
              </div>
            </div>
            <GenreInput value={value} onChange={setValue} placeholder={t("genre_input.placeholder")}
              autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } if (e.key === "Escape") onClose(); }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
