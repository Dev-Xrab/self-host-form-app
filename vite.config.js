import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev
export default defineConfig({
  plugins: [
    react(), 
    mkcert() // Generates valid certificates for both localhost and your local IP
  ],
  server: {
    host: true,  // Exposes the server on your local network IP address
    https: true, // Forces Vite to use HTTPS
    proxy: {
      "/api": {
        target: "http://localhost:5174",
        changeOrigin: true,
        secure: false
      },
    },
  },
})
