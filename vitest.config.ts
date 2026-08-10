import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /*
     * Vitest stubs CSS modules to an empty string by default, which also empties
     * `?raw` imports of stylesheets. The 2.7.0 HUD layout contract asserts against the
     * real `app.css` text, so CSS must be processed rather than stubbed.
     */
    css: true,
  },
});
