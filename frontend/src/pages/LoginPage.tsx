import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Orb from "../components/Orb";
import { Logo } from "../components/Logo";

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-page relative overflow-hidden">
      {/* Interactive Orb background */}
      <div className="absolute inset-0 z-0 opacity-40">
        <Orb
          hoverIntensity={0.3}
          backgroundColor="#08090a"
        />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo — staggered entrance */}
        <div className="text-center">
          <div
            className="flex justify-center"
            style={{
              animation: 'login-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both',
            }}
          >
            <Logo className="h-36 w-auto" />
          </div>
          <p className="text-sm text-muted-foreground mt-2" style={{ animation: 'login-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both' }}>
            {t("login.subtitle")}
          </p>
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
