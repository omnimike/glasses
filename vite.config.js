import { defineConfig } from 'vite';

export default defineConfig({
  base: '/glasses/',
  root: 'src',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
});
