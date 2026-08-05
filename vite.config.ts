import { defineConfig } from 'vite';

// Honour a PORT provided by the environment so tooling can assign a free port.
export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
});
