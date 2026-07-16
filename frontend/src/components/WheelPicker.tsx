import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle, X, Film, Star, RotateCw, Check, Sparkles } from "lucide-react";
import * as api from "../api";
import { useToast } from "../context/ToastContext";

interface WheelPickerProps {
  open: boolean;
  onClose: () => void;
}

interface WishlistEntry {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  media_type?: string;
  poster_url?: string | null;
}

export function WheelPicker({ open, onClose }: WheelPickerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [items, setItems] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [selected, setSelected] = useState<WishlistEntry | null>(null);
  const [currentDisplayIdx, setCurrentDisplayIdx] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [markingWatched, setMarkingWatched] = useState(false);

  const spinTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<"all" | "movie" | "tv">("all");

  // Fetch wishlist items when modal opens
  useEffect(() => {
    if (!open) {
      // Reset state when closing
      setSpinning(false);
      setSelected(null);
      setShowResult(false);
      setCurrentDisplayIdx(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSelected(null);
    setShowResult(false);

    api.listMedia({ page: 0, page_size: 5000, status: "wish" })
      .then((data) => {
        if (cancelled) return;
        const mapped = data.media.map((m) => ({
          id: m.id,
          title: m.title,
          year: m.year,
          genre: m.genre,
          media_type: m.media_type,
          poster_url: m.poster_url,
        }));
        setItems(mapped);
        setMediaTypeFilter("all");
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearInterval(spinTimerRef.current);
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  // ── Filter items by media type ──────────────────────────────────
  const filteredItems = useMemo(() => {
    if (mediaTypeFilter === "all") return items;
    return items.filter((m) => m.media_type === mediaTypeFilter);
  }, [items, mediaTypeFilter]);

  // ── Counts for display ──────────────────────────────────────────
  const movieCount = useMemo(() => items.filter((m) => m.media_type === "movie" || !m.media_type).length, [items]);
  const tvCount = useMemo(() => items.filter((m) => m.media_type === "tv").length, [items]);

  const spin = useCallback(() => {
    if (filteredItems.length === 0 || spinning) return;

    setSpinning(true);
    setShowResult(false);
    setSelected(null);
    setCurrentDisplayIdx(0);

    // The target result
    const targetIdx = Math.floor(Math.random() * filteredItems.length);
    setSelected(filteredItems[targetIdx]);

    // Rapid cycling phase — ~150ms per item
    let cycleCount = 0;
    const totalCycles = 15 + Math.floor(Math.random() * 10); // 15–25 cycles
    let idx = 0;

    spinTimerRef.current = setInterval(() => {
      idx = (idx + 1) % filteredItems.length;
      setCurrentDisplayIdx(idx);
      cycleCount++;

      if (cycleCount >= totalCycles) {
        if (spinTimerRef.current) clearInterval(spinTimerRef.current);
        spinTimerRef.current = null;

        // Slow-down phase — gradually increase interval
        let slowIdx = idx;
        let slowStep = 0;
        const slowSteps = 6;

        const doSlowStep = () => {
          slowStep++;
          slowIdx = (slowIdx + 1) % filteredItems.length;
          setCurrentDisplayIdx(slowIdx);

          if (slowStep < slowSteps) {
            spinTimeoutRef.current = setTimeout(doSlowStep, 80 + slowStep * 60);
          } else {
            // Land on target
            setCurrentDisplayIdx(targetIdx);
            setShowResult(true);
            setSpinning(false);
            setCelebrationKey((k) => k + 1);
            playCelebrationSound();
          }
        };

        spinTimeoutRef.current = setTimeout(doSlowStep, 200);
      }
    }, 100);
  }, [filteredItems, spinning]);

  const handleMarkWatched = useCallback(async () => {
    if (!selected) return;
    setMarkingWatched(true);
    try {
      await api.markMediaAsWatched(selected.id, 7);
      showToast(t("wishlist.marked_as_watched", {
        title: selected.title,
        rating: "7.0",
      }), "success");
      // Remove from list
      setItems((prev) => prev.filter((item) => item.id !== selected.id));
      setSelected(null);
      setShowResult(false);
    } catch {
      showToast(t("wishlist.mark_failed", { message: "" }), "error");
    } finally {
      setMarkingWatched(false);
    }
  }, [selected, showToast, t]);

  // ── Celebration sound (Web Audio API, no external files) ────────
  const playCelebrationSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.12; // quiet
      masterGain.connect(ctx.destination);

      // Two-note rising chime
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + i * 0.12 + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.5);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.5);
      });

      // Clean up after 1s
      setTimeout(() => ctx.close(), 1000);
    } catch { /* audio not available, silently skip */ }
  }, []);

  // ── Random confetti particles ──────────────────────────────────
  const confettiParticles = useMemo(() => {
    const colors = [
      "#e8a838", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6",
      "#a855f7", "#ec4899", "#06b6d4", "#f97316", "#84cc16",
    ];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2 + Math.random() * 2,
      color: colors[i % colors.length],
      size: 4 + Math.random() * 6,
      driftDelay: Math.random() * 2,
    }));
  }, [celebrationKey]);

  // ── Random floating sparkles ────────────────────────────────────
  const sparkles = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: 10 + Math.random() * 80,
      top: 10 + Math.random() * 80,
      delay: Math.random() * 0.8,
      size: 10 + Math.random() * 14,
    }));
  }, [celebrationKey]);

  // ── Reset display when filter changes ──────────────────────────
  const handleFilterChange = useCallback((filter: "all" | "movie" | "tv") => {
    if (spinning) return;
    setMediaTypeFilter(filter);
    setShowResult(false);
    setSelected(null);
    setCurrentDisplayIdx(0);
  }, [spinning]);

  const currentMovie = showResult && selected ? selected : filteredItems[currentDisplayIdx];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-overlay-fade"
        onClick={spinning ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-wheel-enter">
        {/* Entry border glow sweep */}
        <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
          <div className="absolute inset-0 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, transparent 40%, rgba(232,168,56,0.08) 50%, transparent 60%)",
              backgroundSize: "200% 200%",
              animation: "progressSweep 2.5s ease-in-out 0.3s",
            }}
          />
        </div>
        {/* Close button */}
        <button
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="px-6 pt-5 pb-3 text-center animate-enter-1">
          <h2 className="text-base font-semibold flex items-center justify-center gap-2">
            <Shuffle size={16} className="text-primary" />
            {t("wheel.title", "今天看什么")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {items.length > 0
              ? t("wheel.subtitle", { count: filteredItems.length, total: items.length })
              : t("wheel.no_items", "还没有想看的电影")}
          </p>
        </div>

        {/* Media type filter tabs */}
        {items.length > 0 && (
          <div className="px-6 pb-2 flex items-center justify-center gap-1 animate-enter-2">
            {([
              { value: "all" as const, label: t("manage.media_type_all", "全部") },
              { value: "movie" as const, label: `🎬 ${movieCount}` },
              { value: "tv" as const, label: `📺 ${tvCount}` },
            ]).map((opt) => (
              <button
                key={opt.value}
                disabled={spinning}
                onClick={() => handleFilterChange(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  mediaTypeFilter === opt.value
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
                } ${spinning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="px-6 pb-5 animate-enter-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Film size={40} className="mb-3 opacity-30" />
              <p className="text-sm">{t("wheel.no_items_hint", "先去「想看」列表添加一些电影吧")}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Film size={40} className="mb-3 opacity-30" />
              <p className="text-sm">
                {mediaTypeFilter === "tv"
                  ? t("wheel.no_tv", "还没有想看的剧集")
                  : t("wheel.no_movies", "还没有想看的电影")}
              </p>
            </div>
          ) : (
            <>
              {/* Display area */}
              <div className="relative mb-4">
                {/* Poster + Info */}
                <div
                  className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                    showResult
                      ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/10"
                      : "border-border bg-bg-card"
                  } ${spinning ? "animate-stream" : ""}`}
                >
                  {/* Poster */}
                  <div className="w-16 h-24 shrink-0 rounded-lg overflow-hidden bg-muted/60 flex items-center justify-center border border-border-subtle shadow-sm">
                    {currentMovie?.poster_url ? (
                      <img
                        src={currentMovie.poster_url}
                        alt={currentMovie.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film size={24} className="text-muted-foreground/30" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`font-semibold text-base truncate transition-colors ${
                        showResult ? "text-primary" : "text-foreground"
                      }`}
                      key={currentMovie?.id ?? currentMovie?.title}
                    >
                      {currentMovie?.title || ""}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {currentMovie?.year && (
                        <span className="text-xs text-muted-foreground font-medium">
                          {currentMovie.year}
                        </span>
                      )}
                      {currentMovie?.media_type === "tv" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky/10 text-sky border border-sky/20">
                          TV
                        </span>
                      )}
                      {currentMovie?.genre && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/15">
                          {currentMovie.genre.split(" / ")[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Result badge */}
                  {showResult && (
                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg animate-celebration-burst">
                      <Star size={12} className="text-primary-foreground" fill="currentColor" />
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 animate-enter-4">
                <button
                  onClick={spin}
                  disabled={spinning}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                >
                  {spinning ? (
                    <>
                      <RotateCw size={14} className="animate-stream-spin" />
                      {t("wheel.spinning", "抽取中...")}
                    </>
                  ) : showResult ? (
                    <>
                      <Shuffle size={14} />
                      {t("wheel.spin_again", "再抽一次")}
                    </>
                  ) : (
                    <>
                      <Shuffle size={14} />
                      {t("wheel.spin", "抽一个")}
                    </>
                  )}
                </button>

                {showResult && selected && (
                  <button
                    onClick={handleMarkWatched}
                    disabled={markingWatched}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all disabled:opacity-40 bg-accent text-accent-foreground hover:bg-accent/80 active:scale-[0.98]"
                  >
                    {markingWatched ? (
                      <RotateCw size={14} className="animate-stream-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    {t("wheel.mark_watched", "标为已看")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Confetti (only when result shows) ──────────────────── */}
        {showResult && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            {confettiParticles.map((p) => (
              <div
                key={p.id}
                className="absolute"
                style={{
                  left: `${p.left}%`,
                  top: "-10px",
                  width: `${p.size}px`,
                  height: `${p.size * 0.6}px`,
                  background: p.color,
                  borderRadius: "2px",
                  opacity: 0,
                  animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
                  transform: `rotate(${p.id * 37}deg)`,
                }}
              />
            ))}
          </div>
        )}

        {/* ── Floating Sparkles ──────────────────────────────────── */}
        {showResult && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            {sparkles.map((s) => (
              <div
                key={s.id}
                className="absolute"
                style={{
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  width: `${s.size}px`,
                  height: `${s.size}px`,
                  animation: `star-pop 1s ease-out ${s.delay}s forwards`,
                }}
              >
                <Sparkles size={s.size} className="text-primary" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
