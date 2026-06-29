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
        manualChunks: {
          // Core React framework
          vendor: ["react", "react-dom", "react-router-dom"],

          // UI icons (radix-ui now uses individual packages, tree-shaken naturally)
          ui: ["lucide-react"],

          // Charting (only used in StatsTab)
          charts: ["recharts"],

          // Animation (GSAP — used in FadeContent, SplitText)
          animation: ["gsap", "@gsap/react"],

          // WebGL (used in Aurora, LineWaves backgrounds)
          webgl: ["ogl"],

          // i18n
          i18n: ["i18next", "react-i18next"],
        },
      },
    },
  },
});
