import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DBMovie } from "../../types";
import { Modal } from "../Modal";

interface MarkWatchedModalProps {
  open: boolean;
  movie: DBMovie | null;
  onClose: () => void;
  onConfirm: (movieId: number, rating: number) => Promise<void>;
}

export function MarkWatchedModal({ open, movie, onClose, onConfirm }: MarkWatchedModalProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(7);

  return (
    <Modal open={open} onClose={onClose}
      title={t("wishlist_mark_modal.title", { title: movie?.title ?? "" })}
      description={t("wishlist_mark_modal.rating_prompt")}
      footer={
        <div className="flex items-center gap-2 w-full justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={async () => {
            if (!movie) return;
            const rounded = Math.round(rating * 10) / 10;
            await onConfirm(movie.id, rounded);
          }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t("wishlist_mark_modal.confirm")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="text-center">
          <div className="text-5xl font-bold text-amber tabular-nums count-badge" key={rating}>{rating.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground mt-1">/ 10</div>
        </div>
        <input type="range" min={0} max={10} step={0.5} value={rating}
          onChange={(e) => setRating(parseFloat(e.target.value))}
          className="w-full max-w-xs h-1.5 appearance-none rounded-full bg-border accent-amber outline-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-track]:h-1.5 [&::-webkit-slider-track]:rounded-full"
        />
        <div className="flex items-center justify-between w-full max-w-xs text-xs text-muted-foreground">
          <span>0</span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3 text-amber" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            {t("watched_batch_rating.hint")}
          </span>
          <span>10</span>
        </div>
      </div>
    </Modal>
  );
}
