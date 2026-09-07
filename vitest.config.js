import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

// Reuse the app's Vite config (React plugin etc.) and add the test runner
// settings on top, so `vite build` / `vite dev` stay completely untouched.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      css: false,
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      clearMocks: true,
      restoreMocks: true,
    },
  })
);
