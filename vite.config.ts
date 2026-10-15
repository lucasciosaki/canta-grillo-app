import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // expõe para 0.0.0.0 (rede local Wi-Fi / celular)
    port: 5173,
    allowedHosts: true, // permite acesso via túneis HTTPS (Cloudflare, ngrok, etc) e IPs externos
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'bandeira.png', 'favicon.svg'],
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
    })
  ],
})
