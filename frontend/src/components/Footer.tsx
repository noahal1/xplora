import { useTranslation } from "react-i18next";
import BlurText from "./BlurText";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer
      className="py-8 mt-12 text-center space-y-3"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <div style={{ color: "var(--fg-dim)" }}>
        <BlurText
          text={t("footer.tagline")}
          className="text-xs justify-center"
          delay={80}
          animateBy="words"
          direction="bottom"
          threshold={0.3}
        />
      </div>
    </footer>
  );
}
