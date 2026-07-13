import { useTranslation } from "react-i18next";
import BlurText from "./BlurText";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer
      className="py-6 sm:py-8 text-center space-y-3"
    >
      <div className="text-fg-dim">
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
