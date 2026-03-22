import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      /**
       * Vite 8 usa Rolldown: el plugin no puede inyectar `bundle[manifestFilename]` y el archivo no se genera.
       * El manifest real está en `public/manifest.webmanifest` (debe coincidir con `manifest` + defaults del plugin).
       */
      manifestFilename: "manifest.webmanifest",
      includeAssets: ["favicon.svg", "web-app-manifest-512x512.png"],
      manifest: {
        name: "PrintManager",
        short_name: "PrintManager",
        description: "Gestión de pedidos de impresión",
        theme_color: "#0f172a",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/web-app-manifest-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/web-app-manifest-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,svg,png,woff2,webmanifest}"
        ],
        navigateFallback: "index.html",
        runtimeCaching: []
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    host: "0.0.0.0"
  }
});
