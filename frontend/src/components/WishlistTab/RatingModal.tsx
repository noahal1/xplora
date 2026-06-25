import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../ui/badge";
import { Modal } from "../Modal";
import { RatingSlider } from "../shared/RatingSlider";
import { translateGenres } from "../../utils/genre";
import { Film } from "lucide-react";

interface RatingModalProps {
  open: boolean;
  movie: { id: number; title: string; year: number | null; genre: string | null } | null;
  onClose: () => void;
  onConfirm: (movieId: number, rating: number) => Promise<void>;
}

export function WishlistRatingModal({ open, movie, onClose, onConfirm }: RatingModalProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(7);

  return (
    <Modal open={open} onClose={onClose}
      title={movie ? t("wishlist_mark_modal.title", { title: movie.title }) : ""}
      footer={
        <div className="flex items-center gap-2 w-full justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={async () => {
            if (!movie) return;
            await onConfirm(movie.id, Math.round(rating * 10) / 10);
          }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t("wishlist_mark_modal.confirm")}
          </button>
        </div>
      }
    >
      {movie && (
        <div className="space-y-5 py-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Film size={18} style={{ color: "var(--seed-primary)" }} /></div>
            <div>
              <p className="text-sm font-semibold">{movie.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {movie.year && <span className="text-xs text-muted-foreground">{movie.year}</span>}
                {movie.genre && <Badge variant="outline" className="text-[10px]">{translateGenres(movie.genre)}</Badge>}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">{t("wishlist_mark_modal.rating_prompt")}</p>
            <div className="text-center">
              <span className="text-2xl font-bold text-amber count-badge" key={rating}>{rating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground ml-1">/ 10</span>
            </div>
            <div className="px-2">
              <RatingSlider
                value={rating}
                onChange={(v) => setRating(v)}
                size="lg"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5">
                <span>0</span><span>2.5</span><span>5</span><span>7.5</span><span>10</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
