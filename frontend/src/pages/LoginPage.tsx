import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getErrMsg } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import LineWaves from "../components/LineWaves";
import { Logo } from "../components/Logo";
import SplitText from "../components/SplitText";

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t("login.error_empty"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate("/");
    } catch (err) {
      setError(getErrMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-page relative overflow-hidden">
      {/* LineWaves background — amber waves */}
      <div className="absolute inset-0 z-0 opacity-45 max-sm:opacity-60">
        <LineWaves
          speed={0.3}
          brightness={0.5}
          color1="#f59e0b"
          color2="#d97706"
          color3="#78350f"
          enableMouseInteraction={true}
          mouseInfluence={1.5}
          rotation={-45}
          warpIntensity={1}
          innerLineCount={32}
          outerLineCount={32}
        />
      </div>

      {/* Radial vignette overlay — enhances depth on mobile */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none sm:hidden"
        style={{
          background: [
            'radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(8,9,10,0.4) 70%, rgba(8,9,10,0.85) 100%)',
            'radial-gradient(ellipse at 50% 60%, transparent 20%, rgba(8,9,10,0.3) 60%, transparent 100%)',
          ].join(', '),
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo — staggered entrance */}
        <div className="text-center">
          <div
            className="flex justify-center"
            style={{
              animation: 'login-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both',
            }}
          >
            <Logo className="h-16 w-auto" />
          </div>
          <SplitText
            text={t("login.subtitle")}
            tag="p"
            className="text-sm text-muted-foreground mt-2"
            splitType="words"
            delay={60}
            duration={0.6}
            threshold={0}
            rootMargin="0px"
            textAlign="center"
            from={{ opacity: 0, y: 15 }}
            to={{ opacity: 1, y: 0 }}
          />
        </div>

        {/* Form — staggered entrance */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5" style={{ animation: 'login-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both' }}>
            <label htmlFor="username" className="block text-sm font-medium text-foreground">
              {t("login.username")}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("login.username_placeholder")}
              autoFocus
              autoComplete="username"
              className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            />
          </div>
          <div className="space-y-1.5" style={{ animation: 'login-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both' }}>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              {t("login.password")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("login.password_placeholder")}
              autoComplete="current-password"
              className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2" style={{ animation: 'login-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
              {error}
            </p>
          )}

          <div style={{ animation: 'login-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both' }}>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full h-9 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-primary rounded-full animate-stream-spin" />
                  {t("login.logging_in")}
                </span>
              ) : (
                t("login.login")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
