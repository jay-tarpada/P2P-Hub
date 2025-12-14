import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use a proxy in dev so API and Socket.IO appear same-origin to the browser
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: 5173,
        proxy: {
            '/api': {
                target: process.env.VITE_API_PROXY || 'http://localhost:4000',
                changeOrigin: true,
                secure: false,
            },
            '/socket.io': {
                target: process.env.VITE_API_PROXY || 'http://localhost:4000',
                ws: true,
                changeOrigin: true,
                secure: false,
            },
        },
    },
})
