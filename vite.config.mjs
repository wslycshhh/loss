import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { fs: { strict: true, allow: [process.cwd()] } },
  build: { sourcemap: false },
});
