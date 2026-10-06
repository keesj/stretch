import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The app is fully client-side (routines, stretches and all progress
      // live in local storage), so precaching the built assets is enough
      // for a complete offline experience after the first visit.
      registerType: 'autoUpdate',
      manifest: {
        name: 'Stretch',
        short_name: 'Stretch',
        description: 'A calm, mobile-first web application for guided stretching routines',
        theme_color: '#0c4a6e',
        background_color: '#faf5f0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Offline navigation: fall back to the precached app shell
        navigateFallback: 'index.html',
      },
    }),
  ],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
})
