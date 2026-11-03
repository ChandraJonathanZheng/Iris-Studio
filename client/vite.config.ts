import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development Vite forwards /api to the .NET API (one origin → the auth cookie just works, no CORS).
// `npm run dev:mock` uses the in-browser mock API instead (src/mocks), so the UI runs without .NET.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: mode === 'mock' ? undefined : { '/api': 'http://localhost:5080' },
  },
  build: {
    // Production: the .NET app serves the built React files from wwwroot (one deploy, one domain).
    outDir: mode === 'mock' ? 'dist' : '../server/IrisStudio.Api/wwwroot',
    emptyOutDir: true,
  },
}));
