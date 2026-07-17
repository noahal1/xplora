import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import "./i18n/config";
import App from "./App";

// ── PWA Service Worker registration ───────────────────────────────
// Expose registration so SWUpdatePrompt can trigger updates
const swReady = { current: null as ServiceWorkerRegistration | null };
(window as any).__swRegistration = swReady;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      swReady.current = reg;

      // Notify UI if a worker is already waiting
      if (reg.waiting) window.dispatchEvent(new CustomEvent("sw-update-available"));

      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("sw-update-available"));
          }
        });
      });
    }, (err) => console.warn("[SW] register fail", err));

    // Reload after SKIP_WAITING activates a new SW
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
