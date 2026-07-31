import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { Share2, Film, ListTodo } from "lucide-react";
import type { PublicPlaylist } from "../types";
import * as api from "../api";
import { getErrMsg } from "../lib/utils";
import FadeContent from "../components/FadeContent";

function Poster({ src, title }: { src?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-input)" }}>
        <Film size={18} style={{ color: "var(--fg-dim)", opacity: 0.5 }} />
      </div>
    );
  }
  return (
    <img src={src} alt={title} className="w-full h-full object-cover" loading="lazy"
      onError={() => setFailed(true)} />
  );
}

export function SharePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<PublicPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setError(t("share.not_found")); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    api.getPublicPlaylist(token)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(getErrMsg(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--seed-bg)" }}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          {t("share.loading")}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--seed-bg)" }}>
        <FadeContent className="section-card w-full max-w-md p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}>
            <Share2 size={22} className="text-primary" />
          </div>
          <h1 className="text-base font-semibold">{t("share.not_found")}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t("share.not_found_hint")}</p>
          <div className="mt-5">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ListTodo size={14} />
              {t("share.public_note")}
            </Link>
          </div>
        </FadeContent>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--seed-bg)" }}>
      {/* Header */}
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <FadeContent className="section-card">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-16 h-24 rounded-lg overflow-hidden border border-border-subtle shrink-0">
              <Poster src={data.cover_url} title={data.name} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-semibold truncate">{data.name}</h1>
                <span className="badge font-mono text-xs">{t("playlists.item_count", { count: data.item_count })}</span>
              </div>
              {data.description && (
                <p className="text-sm text-muted-foreground mt-1.5">{data.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
              <Share2 size={11} />
              {t("share.public_note")}
            </div>
          </div>
        </FadeContent>

        {/* Items grid */}
        {data.items.length === 0 ? (
          <FadeContent className="section-card mt-4">
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t("playlists.empty_playlist")}</p>
            </div>
          </FadeContent>
        ) : (
          <FadeContent className="section-card mt-4">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3">
              {data.items.map((item, idx) => (
                <div
                  key={idx}
                  className="group rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-all card-lift"
                  title={`${item.title}${item.year != null ? ` (${item.year})` : ""}`}
                >
                  <div className="aspect-[2/3] w-full overflow-hidden">
                    <Poster src={item.poster_url} title={item.title} />
                  </div>
                  <div className="p-1.5 sm:p-2">
                    <p className="text-[11px] sm:text-xs font-medium line-clamp-1" title={item.title}>{item.title}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {item.year != null && <span className="text-[9px] text-muted-foreground tabular-nums">{item.year}</span>}
                      {item.media_type === "tv" && (
                        <span className="text-[9px] px-1 py-px rounded-full text-sky border border-sky/30 bg-sky/5 leading-none">TV</span>
                      )}
                    </div>
                    {item.note && (
                      <p className="text-[9px] text-muted-foreground italic truncate mt-0.5">“{item.note}”</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </FadeContent>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors">
            <ListTodo size={12} />
            {t("share.public_note")}
          </Link>
        </div>
      </div>
    </div>
  );
}
