import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  /** True while the account still needs to replace its initial/default password. */
  mustChangePassword: boolean;
  /** Logs in and returns true if a password change is required before using the app. */
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearMustChangePassword: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  mustChangePassword: false,
  login: async () => false,
  logout: () => {},
  clearMustChangePassword: () => {},
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("xplora-token")
  );
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, verify token is still valid
  useEffect(() => {
    const storedToken = localStorage.getItem("xplora-token");
    if (storedToken) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Invalid token");
          return res.json();
        })
        .then((data) => {
          setUser({ id: data.id, username: data.username, is_admin: data.is_admin });
          setMustChangePassword(!!data.must_change_password);
          setToken(storedToken);
        })
        .catch(() => {
          localStorage.removeItem("xplora-token");
          setToken(null);
          setUser(null);
          setMustChangePassword(false);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "登录失败" }));
      throw new Error(err.detail || "登录失败");
    }
    const data = await res.json();
    localStorage.setItem("xplora-token", data.token);
    setToken(data.token);
    setMustChangePassword(!!data.must_change_password);

    // Fetch user details to get real ID (await in the same function so user
    // is set before the calling code navigates away from the login page)
    const meRes = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      setUser({ id: me.id, username: me.username, is_admin: me.is_admin });
      setMustChangePassword(!!me.must_change_password);
    }
    return !!data.must_change_password;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("xplora-token");
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
  }, []);

  const clearMustChangePassword = useCallback(() => {
    setMustChangePassword(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        mustChangePassword,
        login,
        logout,
        clearMustChangePassword,
        isAuthenticated: !!token && !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
