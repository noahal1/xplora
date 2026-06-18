import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { Logo } from "./Logo";
import { Globe, Heart, ExternalLink } from "lucide-react";

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
          <div className="flex items-center justify-center mx-auto mb-3" style={{ width: "140px", height: "48px" }}>
            <Logo className="h-full w-auto" />
          </div>
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
            href="https://github.com/noahal1/xplora"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-accent"
            style={{ color: "var(--fg-secondary)" }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
            <ExternalLink size={10} className="opacity-50" />
          </a>
          <a
            href="https://github.com/noahal1/xplora#readme"
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
