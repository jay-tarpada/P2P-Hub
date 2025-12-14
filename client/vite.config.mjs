import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Use a proxy in dev so API and Socket.IO appear same-origin to the browser
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const target = env.VITE_API_PROXY || env.VITE_API_URL || 'http://localhost:4000'
    return {
        plugins: [react()],
        server: {
            host: true,
            port: 5173,
            proxy: {
                '/api': {
                    target,
                    changeOrigin: true,
                    secure: false,
                },
                '/socket.io': {
                    target,
                    ws: true,
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
    }
})
