import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { getErrMsg } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { useSetup } from "../context/SetupContext";
import { useTheme } from "../context/ThemeContext";
import { runSetup } from "../api";
import LineWaves from "../components/LineWaves";
import { Logo } from "../components/Logo";

// Order matches the API_KEY_NAMES in the backend config_manager.
const API_KEY_FIELDS: { key: string; recommended?: boolean }[] = [
  { key: "tmdb", recommended: true },
  { key: "deepseek", recommended: true },
  { key: "openai" },
  { key: "claude" },
  { key: "gemini" },
  { key: "zhipu" },
  { key: "ollama" },
];

const STEP_LABELS = ["welcome", "account", "api", "done"] as const;

export function SetupWizardPage() {
  const { t } = useTranslation();
  const { isAuthenticated, setSession } = useAuth();
  const { needsSetup, isLoading } = useSetup();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [step, setStep] = useState<number>(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already set up (or already logged in), leave the wizard.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate("/", { replace: true });
    } else if (needsSetup === false) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, needsSetup, navigate]);

  if (isLoading || isAuthenticated || needsSetup === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
      </div>
    );
  }

  const goAccount = () => {
    setError("");
    if (!username.trim()) {
      setError(t("setup.error_empty_username"));
      return;
    }
    if (password.length < 8) {
      setError(t("setup.error_short_password"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("setup.error_mismatch"));
      return;
    }
    setStep(2);
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await runSetup({
        username: username.trim(),
        password,
        api_keys: apiKeys,
      });
      // Resolve the real user id from the issued token.
      const meRes = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      let user = { id: 0, username: data.username, is_admin: data.is_admin };
      if (meRes.ok) {
        const me = await meRes.json();
        user = { id: me.id, username: me.username, is_admin: me.is_admin };
      }
      setSession(data.token, user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getErrMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20";

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="text-center space-y-5">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t("setup.welcome_title")}</h1>
            <p className="text-sm text-muted-foreground mt-2">{t("setup.welcome_subtitle")}</p>
          </div>
          <ul className="text-sm text-muted-foreground space-y-2 text-left max-w-xs mx-auto">
            <li className="flex items-start gap-2">
              <span className="mt-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0">1</span>
              <span>{t("setup.steps.account")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0">2</span>
              <span>{t("setup.steps.api")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0">3</span>
              <span>{t("setup.steps.done")}</span>
            </li>
          </ul>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="btn btn-primary w-full h-9 rounded-lg text-sm font-medium transition-all"
          >
            {t("setup.next")}
          </button>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="space-y-3.5">
          <div className="text-center mb-1">
            <h1 className="text-lg font-semibold text-foreground">{t("setup.account_title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("setup.account_subtitle")}</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="su-username" className="block text-sm font-medium text-foreground">{t("setup.username")}</label>
            <input id="su-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("setup.username_placeholder")} autoFocus autoComplete="username" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="su-password" className="block text-sm font-medium text-foreground">{t("setup.password")}</label>
            <input id="su-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("setup.password_placeholder")} autoComplete="new-password" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="su-confirm" className="block text-sm font-medium text-foreground">{t("setup.confirm_password")}</label>
            <input id="su-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("setup.confirm_password_placeholder")} autoComplete="new-password" className={inputClass} />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep(0)} className="btn btn-ghost h-9 rounded-lg text-sm font-medium flex-1 transition-all">{t("setup.back")}</button>
            <button type="button" onClick={goAccount} className="btn btn-primary h-9 rounded-lg text-sm font-medium flex-1 transition-all">{t("setup.next")}</button>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-3">
          <div className="text-center mb-1">
            <h1 className="text-lg font-semibold text-foreground">{t("setup.api_title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("setup.api_subtitle")}</p>
            <p className="text-xs text-muted-foreground/80 mt-1">{t("setup.api_hint")}</p>
          </div>
          <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
            {API_KEY_FIELDS.map(({ key, recommended }) => (
              <div key={key} className="space-y-1">
                <label htmlFor={`su-${key}`} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {t(`setup.providers.${key}`)}
                  {recommended && (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{t("setup.recommended")}</span>
                  )}
                </label>
                <input
                  id={`su-${key}`}
                  type="password"
                  value={apiKeys[key] || ""}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={t(`setup.provider_desc.${key}`)}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep(1)} className="btn btn-ghost h-9 rounded-lg text-sm font-medium flex-1 transition-all">{t("setup.back")}</button>
            <button type="button" onClick={submit} disabled={loading} className="btn btn-primary h-9 rounded-lg text-sm font-medium flex-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? t("setup.submitting") : t("setup.finish")}
            </button>
          </div>
          <button type="button" onClick={submit} disabled={loading} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
            {t("setup.skip")}
          </button>
        </div>
      );
    }

    return null;
  };

  const showProgress = step >= 1;
  const currentStepIndex = Math.min(step, 3);

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 bg-page relative overflow-hidden`}>
      {/* LineWaves background — fade out on exit for smooth compositing */}
      <div className={`absolute inset-0 z-0 ${isLight ? "opacity-20" : "opacity-45 max-sm:opacity-60"}`}>
        <LineWaves
          speed={0.3}
          brightness={isLight ? 0.4 : 0.5}
          color1={isLight ? "#000000" : "#f59e0b"}
          color2={isLight ? "#555555" : "#d97706"}
          color3={isLight ? "#cccccc" : "#78350f"}
          enableMouseInteraction={true}
          mouseInfluence={1.5}
          rotation={-45}
          warpIntensity={1}
          innerLineCount={32}
          outerLineCount={32}
        />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-5">
          <div className="flex justify-center">
            <Logo className="h-14 w-auto" />
          </div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">{t("setup.title")}</p>
        </div>

        {showProgress && (
          <div className="flex items-center justify-center gap-2 mb-5">
            {STEP_LABELS.slice(1, 4).map((_, i) => {
              const idx = i + 1;
              const active = idx <= currentStepIndex;
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {idx}
                  </div>
                  {idx < 3 && <div className={`w-8 h-0.5 ${idx < currentStepIndex ? "bg-primary" : "bg-muted"}`} />}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-card/60 backdrop-blur-sm border border-border rounded-xl p-5">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
