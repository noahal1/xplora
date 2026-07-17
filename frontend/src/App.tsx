import { useEffect, useRef, lazy, Suspense } from "react";
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
import { UpdateBanner } from "./components/UpdateBanner";
import { SWUpdatePrompt } from "./components/SWUpdatePrompt";
import { Footer } from "./components/Footer";
import "./style.css";

// Lazy-loaded route-level chunks (pages & tabs)
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminLogsPage = lazy(() => import("./pages/AdminLogsPage").then((m) => ({ default: m.AdminLogsPage })));
const AdminDiagnosticsPage = lazy(() => import("./pages/AdminDiagnosticsPage").then((m) => ({ default: m.AdminDiagnosticsPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const WatchedTab = lazy(() => import("./components/WatchedTab").then((m) => ({ default: m.WatchedTab })));
const WishlistTab = lazy(() => import("./components/WishlistTab").then((m) => ({ default: m.WishlistTab })));
const RecommendTab = lazy(() => import("./components/RecommendTab").then((m) => ({ default: m.RecommendTab })));
const ManageTab = lazy(() => import("./components/ManageTab").then((m) => ({ default: m.ManageTab })));
const StatsTab = lazy(() => import("./components/StatsTab").then((m) => ({ default: m.StatsTab })));
const TopRatedTab = lazy(() => import("./components/TopRatedTab").then((m) => ({ default: m.TopRatedTab })));
const MediaServerTab = lazy(() => import("./components/MediaServerTab").then((m) => ({ default: m.MediaServerTab })));

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
  const prevPathRef = useRef(location.pathname);

  // Tab order for directional animation
  const tabOrder = ["/watched", "/wishlist", "/recommend", "/stats", "/manage"];

  // Determine navigation direction
  const prevPath = prevPathRef.current;
  const currentTabIndex = tabOrder.indexOf(location.pathname);
  const prevTabIndex = tabOrder.indexOf(prevPath);

  // For non-tab pages (admin, profile), always animate forward
  const goingForward =
    prevTabIndex === -1 || currentTabIndex === -1 || currentTabIndex >= prevTabIndex;
  const pageAnimClass = goingForward
    ? "animate-page-slide-in-right"
    : "animate-page-slide-in-left";

  // Update previous path AFTER render
  useEffect(() => {
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  // Reset scroll to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <HistoryProvider>
      <EnrichProvider>
        {/* Full-width Aurora background */}
        <div className="fixed inset-0 pointer-events-none z-[-1] opacity-15">
          <Aurora
            colorStops={['#e8a838', '#f59e0b', '#e8a838']}
            amplitude={0.15}
            blend={0.8}
            speed={0.2}
          />
        </div>

        {/* Full-width Header */}
        <div className="w-full">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <Header />
          </div>
        </div>

        {/* Main content area */}
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:pb-8">
          <SWUpdatePrompt />
          <UpdateBanner />
          <EnrichBanner />
          <TabNav />
          <div className="flex flex-col gap-4 sm:gap-8 py-3 sm:py-6">
            {/* Re-key on pathname to re-trigger entrance animation on every tab switch */}
            <div key={location.pathname} className={pageAnimClass}>
              <Suspense fallback={
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
                </div>
              }>
                <Routes>
                  <Route path="/" element={<Navigate to="/watched" replace />} />
                  <Route path="/watched" element={<WatchedTab />} />
                  <Route path="/wishlist" element={<WishlistTab />} />
                  <Route path="/recommend" element={<RecommendTab />} />
                  <Route path="/top-rated" element={<TopRatedTab />} />
                  <Route path="/stats" element={<StatsTab />} />
                  <Route path="/manage" element={<ManageTab />} />
                  <Route path="/media-servers" element={<MediaServerTab />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/logs" element={<AdminLogsPage />} />
                  <Route path="/admin/diagnostics" element={<AdminDiagnosticsPage />} />
                  <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
                  <Route path="/profile" element={<ProfilePage />} />
                </Routes>
              </Suspense>
            </div>
          </div>
          <HistorySidebar />
        </div>

        {/* Full-width Footer */}
        <div className="w-full mt-8 sm:mt-10 border-t border-border-subtle">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <Footer />
          </div>
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
