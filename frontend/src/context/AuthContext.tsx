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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: async () => {},
  logout: () => {},
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("xplora-token")
  );
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
          setToken(storedToken);
        })
        .catch(() => {
          localStorage.removeItem("xplora-token");
          setToken(null);
          setUser(null);
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
    setUser({ id: 0, username: data.username, is_admin: data.is_admin });
    // Fetch user details to get ID
    const meRes = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      setUser({ id: me.id, username: me.username, is_admin: me.is_admin });
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("xplora-token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
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
