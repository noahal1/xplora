import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { Github, Globe, Heart, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface HealthInfo {
  version: string;
}

export function AboutModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/health")
        .then((r) => r.json())
        .then((data) => setHealth(data))
        .catch(() => {});
    }
  }, [open]);

  const techStack = [
    { name: "React 19", color: "#61DAFB" },
    { name: "TypeScript", color: "#3178C6" },
    { name: "FastAPI", color: "#009688" },
    { name: "Python 3", color: "#3776AB" },
    { name: "SQLite", color: "#003B57" },
    { name: "Docker", color: "#2496ED" },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("about.title")}>
      <div className="flex flex-col items-center text-center py-2 space-y-5">
        {/* Logo + Version */}
        <div>
          <div className="text-4xl mb-2">🎬</div>
          <h2 className="text-xl font-bold text-foreground">Xplora</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t("about.tagline")}
          </p>
          {health?.version && (
            <span
              className="inline-block mt-2 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--fg-muted)",
              }}
            >
              {health.version}
            </span>
          )}
        </div>

        {/* Tech Stack */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
            {t("about.tech_stack")}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {techStack.map((tech) => (
              <span
                key={tech.name}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium"
                style={{
                  background: `${tech.color}10`,
                  color: tech.color,
                  border: `1px solid ${tech.color}20`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: tech.color }}
                />
                {tech.name}
              </span>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div
          className="w-full"
          style={{ height: "1px", background: "var(--border-subtle)" }}
        />

        {/* Description */}
        <p className="text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
          {t("about.description")}
        </p>

        {/* Links */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            href="https://github.com/noahang/xplora"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-accent"
            style={{ color: "var(--fg-secondary)" }}
          >
            <Github size={14} />
            GitHub
            <ExternalLink size={10} className="opacity-50" />
          </a>
          <a
            href="https://github.com/noahang/xplora#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-accent"
            style={{ color: "var(--fg-secondary)" }}
          >
            <Globe size={14} />
            {t("about.docs")}
            <ExternalLink size={10} className="opacity-50" />
          </a>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          {t("about.made_with")} <Heart size={10} className="text-pink" /> · MIT {t("about.license")}
        </p>
      </div>
    </Modal>
  );
}
