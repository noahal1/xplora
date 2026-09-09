import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { changePassword } from "../api";
import { getErrMsg } from "../lib/utils";
import { Logo } from "../components/Logo";

export function ForcePasswordChangePage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, mustChangePassword, clearMustChangePassword, logout } = useAuth();
  const navigate = useNavigate();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!mustChangePassword) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError(t("force_password_change.error_empty"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("force_password_change.error_too_short"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("force_password_change.error_mismatch"));
      return;
    }

    setLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      clearMustChangePassword();
      navigate("/");
    } catch (err) {
      setError(getErrMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-page relative overflow-hidden">
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-6">
          <div className="flex justify-center">
            <Logo className="h-14 w-auto" />
          </div>
          <h1 className="text-lg font-semibold text-foreground mt-3">
            {t("force_password_change.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("force_password_change.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label htmlFor="old-password" className="block text-sm font-medium text-foreground">
              {t("force_password_change.old_password")}
            </label>
            <input
              id="old-password"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-password" className="block text-sm font-medium text-foreground">
              {t("force_password_change.new_password")}
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground">
              {t("force_password_change.confirm_password")}
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full h-9 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? t("force_password_change.submitting") : t("force_password_change.submit")}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("admin.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
