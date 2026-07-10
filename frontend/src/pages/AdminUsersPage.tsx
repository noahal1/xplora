import { useState, useEffect, type FormEvent } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { adminDeleteUser, adminResetPassword } from "../api";
import { Modal } from "../components/Modal";
import { getErrMsg } from "../lib/utils";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../utils/date";
import FadeContent from "../components/FadeContent";

interface UserInfo {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const { token, user: currentUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<UserInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".user-menu-dropdown")) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      showToast(t("admin.load_failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      showToast(t("admin.create_failed"), "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: t("admin.create_failed") }));
        throw new Error(err.detail || t("admin.create_failed"));
      }
      showToast(t("admin.created", { username: newUsername.trim() }), "success");
      setNewUsername("");
      setNewPassword("");
      loadUsers();
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await adminDeleteUser(deleteConfirm.id);
      showToast(t("admin.user_deleted", { username: deleteConfirm.username }), "success");
      setDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (resetPassword.length < 4) {
      showToast(t("admin.pwd_too_short"), "error");
      return;
    }
    setResetting(true);
    try {
      await adminResetPassword(resetTarget.id, resetPassword);
      showToast(t("admin.pwd_reset", { username: resetTarget.username }), "success");
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      showToast(getErrMsg(err), "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{t("admin.tab_users")}</h1>
      </div>

      {/* Create User Form */}
      <FadeContent className="section-card">
        <div className="section-header">
          <h2 className="section-title flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            {t("admin.add_user")}
          </h2>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-end gap-2.5">
          <div className="flex-1 w-full">
            <label className="block text-xs text-muted-foreground mb-1.5">{t("admin.username")}</label>
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder={t("admin.username_placeholder")} className="input-field w-full h-9 text-sm" />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs text-muted-foreground mb-1.5">{t("admin.password")}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("admin.password_placeholder")} className="input-field w-full h-9 text-sm" />
          </div>
          <button type="submit" disabled={creating} className="btn btn-primary h-9">
            {creating ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-stream-spin" />
                {t("admin.creating")}
              </span>
            ) : t("admin.create")}
          </button>
        </form>
      </FadeContent>

      {/* Users List */}
      <FadeContent className="section-card">
        <div className="section-header">
          <h2 className="section-title">
            {t("admin.user_list")}
            <span className="text-muted-foreground font-normal ml-1.5">({users.length})</span>
          </h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">{t("admin.no_users")}</div>
        ) : (
          <div className="space-y-1.5">
            {users.map((u) => {
              const isMe = currentUser?.id === u.id;
              return (
                <div key={u.id} className="card p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${u.is_admin ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-accent text-accent-foreground"}`}>
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{u.username}</span>
                        {u.is_admin && <span className="badge text-[10px]">{t("admin.admin_badge")}</span>}
                        {isMe && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground font-medium">{t("admin.current_badge")}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">{t("admin.created_at", { date: formatDate(u.created_at) })}</span>
                    </div>
                  </div>
                  {!isMe && (
                    <div className="relative shrink-0 user-menu-dropdown">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === u.id ? null : u.id); }}
                        className="btn btn-ghost btn-xs px-1"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="5" r="1" />
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="12" cy="19" r="1" />
                        </svg>
                      </button>
                      {menuOpenId === u.id && (
                        <div className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg border border-border bg-popover shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                          <button
                            onClick={() => { setResetTarget(u); setResetPassword(""); setMenuOpenId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            {t("admin.reset_pwd")}
                          </button>
                          <button
                            onClick={() => { setDeleteConfirm(u); setMenuOpenId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            {t("admin.delete_user")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </FadeContent>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={t("admin.delete_confirm_title")}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="admin.delete_confirm_text"
              values={{ username: deleteConfirm?.username ?? "" }}
              components={{ strong: <strong className="text-foreground font-semibold" /> }}
            />
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="btn btn-ghost btn-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn btn-sm"
              style={{ background: 'var(--destructive)', color: '#fff', borderColor: 'transparent' }}
            >
              {deleting ? t("admin.delete_progress") : t("admin.confirm_delete")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={t("admin.reset_pwd_title", { username: resetTarget?.username || "" })}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              {t("admin.new_password")}
            </label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder={t("admin.new_password_placeholder")}
              className="input-field w-full h-9 text-sm"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={() => setResetTarget(null)}
              className="btn btn-ghost btn-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleResetPassword}
              disabled={resetting || resetPassword.length < 4}
              className="btn btn-primary btn-sm"
            >
              {resetting ? t("admin.reset_progress") : t("admin.confirm_reset")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
