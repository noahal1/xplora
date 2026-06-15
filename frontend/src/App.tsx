import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { HistoryProvider } from "./context/HistoryContext";
import { EnrichProvider } from "./context/EnrichContext";
import { Toaster } from "./components/ui/sonner";
import Aurora from "./components/Aurora";
import { Header } from "./components/Header";
import { TabNav } from "./components/TabNav";
import { HistorySidebar } from "./components/HistorySidebar";
import { EnrichBanner } from "./components/EnrichBanner";
import { Footer } from "./components/Footer";
import "./style.css";

// Lazy-loaded route-level chunks (pages & tabs)
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const AdminPanel = lazy(() => import("./pages/AdminPanel").then((m) => ({ default: m.AdminPanel })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const WatchedTab = lazy(() => import("./components/WatchedTab").then((m) => ({ default: m.WatchedTab })));
const WishlistTab = lazy(() => import("./components/WishlistTab").then((m) => ({ default: m.WishlistTab })));
const RecommendTab = lazy(() => import("./components/RecommendTab").then((m) => ({ default: m.RecommendTab })));
const ManageTab = lazy(() => import("./components/ManageTab").then((m) => ({ default: m.ManageTab })));
const HistoryTab = lazy(() => import("./components/HistoryTab").then((m) => ({ default: m.HistoryTab })));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function MainApp() {
  const location = useLocation();

  // Reset scroll to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <HistoryProvider>
      <EnrichProvider>
        <div className="max-w-[1024px] mx-auto px-4 sm:px-5 py-3 sm:py-6 pb-20 sm:pb-6">
          <div className="fixed inset-0 pointer-events-none z-[-1] opacity-15">
            <Aurora
              colorStops={['#e8a838', '#f59e0b', '#e8a838']}
              amplitude={0.15}
              blend={0.8}
              speed={0.2}
            />
          </div>
          <Header />
          <EnrichBanner />
          <TabNav />
          <div className="flex flex-col gap-3 sm:gap-6 py-3 sm:py-6">
            <div className="animate-fade-in">
              <Suspense fallback={
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                </div>
              }>
                <Routes>
                  <Route path="/" element={<Navigate to="/watched" replace />} />
                  <Route path="/watched" element={<WatchedTab key="watched" />} />
                  <Route path="/wishlist" element={<WishlistTab key="wishlist" />} />
                  <Route path="/recommend" element={<RecommendTab key="recommend" />} />
                  <Route path="/manage" element={<ManageTab key="manage" />} />
                  <Route path="/history" element={<HistoryTab key="history" />} />
                </Routes>
              </Suspense>
            </div>
          </div>
          <HistorySidebar />
          <Footer />
        </div>
      </EnrichProvider>
    </HistoryProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-page">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
        </div>
      }>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPanel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainApp />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
      <Toaster position="bottom-center" richColors closeButton />
    </ToastProvider>
  );
}
