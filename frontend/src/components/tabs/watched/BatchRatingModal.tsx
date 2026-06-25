import { useState } from "react";
import type { TFunction } from "i18next";
import { Modal } from "../../Modal";
import { RatingSlider } from "../../shared/RatingSlider";

interface BatchRatingModalProps {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: (rating: number) => void;
  t: TFunction;
}

export function BatchRatingModal({ open, onClose, selectedCount, onConfirm, t }: BatchRatingModalProps) {
  const [batchRatingValue, setBatchRatingValue] = useState(7);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("watched_batch_rating.title", { count: selectedCount })}
      footer={
        <div className="flex items-center gap-2 w-full justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onConfirm(batchRatingValue)}>
            {t("common.confirm")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="text-center">
          <div className="text-5xl font-bold text-amber tabular-nums count-badge" key={batchRatingValue}>
            {batchRatingValue.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">/ 10</div>
        </div>
        <RatingSlider
          value={batchRatingValue}
          onChange={setBatchRatingValue}
          size="lg"
        />
        <div className="flex items-center justify-between w-full max-w-xs text-xs text-muted-foreground">
          <span>0</span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3 text-amber" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {t("watched_batch_rating.hint")}
          </span>
          <span>10</span>
        </div>
      </div>
    </Modal>
  );
}
