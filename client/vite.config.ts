import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// In development Vite forwards /api to the .NET API (one origin → the auth cookie just works, no CORS).
// `npm run dev:mock` uses the in-browser mock API instead (src/mocks), so the UI runs without .NET.
export default defineConfig(({ mode }) => ({
  // `vite build --mode proto` → one self-contained HTML file (JS + CSS inlined) for sharing as a clickable prototype
  plugins: mode === 'proto' ? [react(), viteSingleFile()] : [react()],
  server: {
    port: 5173,
    proxy: mode === 'mock' ? undefined : { '/api': 'http://localhost:5080' },
  },
  build: {
    // Production: the .NET app serves the built React files from wwwroot (one deploy, one domain).
    outDir: mode === 'proto' ? 'dist-proto' : mode === 'mock' ? 'dist' : '../server/IrisStudio.Api/wwwroot',
    emptyOutDir: true,
  },
}));
