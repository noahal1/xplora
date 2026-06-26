import { useState, useCallback, useEffect } from "react";

interface UseRatingEditorOptions {
  movieId: number;
  currentRating: number;
  onSaveRating: (id: number, rating: number) => Promise<void>;
}

interface UseRatingEditorReturn {
  editing: boolean;
  localSlider: number;
  justSaved: boolean;
  setLocalSlider: (v: number) => void;
  handleStartEdit: () => void;
  handleSave: () => void;
  handleCancel: () => void;
}

export function useRatingEditor({
  movieId,
  currentRating,
  onSaveRating,
}: UseRatingEditorOptions): UseRatingEditorReturn {
  const [editing, setEditing] = useState(false);
  const [localSlider, setLocalSlider] = useState(currentRating);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setEditing(false);
    setLocalSlider(currentRating);
    setJustSaved(false);
  }, [movieId, currentRating]);

  const handleStartEdit = useCallback(() => {
    setLocalSlider(currentRating);
    setEditing(true);
  }, [currentRating]);

  const handleSave = useCallback(() => {
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    onSaveRating(movieId, localSlider);
  }, [movieId, localSlider, onSaveRating]);

  const handleCancel = useCallback(() => setEditing(false), []);

  return {
    editing,
    localSlider,
    justSaved,
    setLocalSlider,
    handleStartEdit,
    handleSave,
    handleCancel,
  };
}
