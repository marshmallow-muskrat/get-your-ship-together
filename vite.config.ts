import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Honour a PORT provided by the environment so tooling can assign a free port.
export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        proto2d: resolve(__dirname, 'proto2d.html'),
        base: resolve(__dirname, 'base.html'),
      },
    },
  },
});
