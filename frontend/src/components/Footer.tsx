import { useTranslation } from "react-i18next";
import BlurText from "./BlurText";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer
      className="py-4 sm:py-5 text-center space-y-2"
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
