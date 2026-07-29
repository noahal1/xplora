/// <reference types="vite/client" />

interface Window {
  __swRegistration: { current: ServiceWorkerRegistration | null };
}
