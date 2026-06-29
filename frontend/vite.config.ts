import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { type PluginOption } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle analysis — run with `BUILD_ANALYZE=true pnpm build`
    ...(process.env.BUILD_ANALYZE
      ? [
          visualizer({
            filename: "dist/stats.html",
            open: true,
            gzipSize: true,
            brotliSize: true,
          }) as PluginOption,
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8327",
        changeOrigin: true,
      },
      "/static": {
        target: "http://localhost:8327",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Match on package name only (not path separator), works cross-platform
          if (id.includes("/react-dom") || id.includes("/react-router-dom")) return "vendor";
          if (id.includes("/lucide-react")) return "ui";
          if (id.includes("/recharts")) return "charts";
          if (id.includes("/gsap")) return "animation";
          if (id.includes("/ogl")) return "webgl";
          if (id.includes("/i18next") || id.includes("/react-i18next")) return "i18n";
          // react stays in main entry for fast first paint
        },
      },
    },
  },
});
