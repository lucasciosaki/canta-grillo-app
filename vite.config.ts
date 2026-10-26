import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export const workboxConfig = {
  skipWaiting: true,
  clientsClaim: true,
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  importScripts: ['/push-sw.js'],
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/rest\/v1\/.*/i,
      handler: 'NetworkFirst' as const,
      options: {
        cacheName: 'supabase-api-cache',
        networkTimeoutSeconds: 4,
        expiration: {
          maxEntries: 300,
          maxAgeSeconds: 24 * 60 * 60, // 24h
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /^https?:\/\/.*\/storage\/v1\/object\/public\/.*/i,
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'supabase-storage-images',
        expiration: {
          maxEntries: 150,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 dias
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // expõe para 0.0.0.0 (rede local Wi-Fi / celular)
    port: 5173,
    allowedHosts: true, // permite acesso via túneis HTTPS (Cloudflare, ngrok, etc) e IPs externos
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'bandeira.png', 'favicon.svg'],
      workbox: workboxConfig,
      manifest: {
        name: 'República Canta Grillo',
        short_name: 'Canta Grillo',
        description: 'Aplicativo de organização diária da República Canta Grillo',
        theme_color: '#f6f5ef',
        background_color: '#f6f5ef',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    }),
    {
      name: 'prepend-synchronous-push-sw',
      apply: 'build',
      enforce: 'post',
      closeBundle() {
        try {
          const swPath = path.resolve('dist/sw.js')
          const pushSwPath = path.resolve('public/push-sw.js')
          if (fs.existsSync(swPath) && fs.existsSync(pushSwPath)) {
            const pushCode = fs.readFileSync(pushSwPath, 'utf-8')
            let swCode = fs.readFileSync(swPath, 'utf-8')
            // Remove importScripts("/push-sw.js") de dentro do wrapper assíncrono do Workbox
            swCode = swCode.replace(/importScripts\(["']\/push-sw\.js["']\),?/g, '')
            if (!swCode.includes("self.addEventListener('push'")) {
              fs.writeFileSync(swPath, `${pushCode}\n${swCode}`, 'utf-8')
            }
          }
        } catch (err) {
          console.warn('[prepend-synchronous-push-sw] Aviso ao injetar push-sw no topo de sw.js:', err)
        }
      }
    }
  ],
})
