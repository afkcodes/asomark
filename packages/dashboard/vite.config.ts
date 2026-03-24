import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: { port: 3002 },
  plugins: [
    tailwindcss(),
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
})
