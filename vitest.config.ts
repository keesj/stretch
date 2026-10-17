import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: [
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'server/**/*.{test,spec}.{js,ts}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/test/**',
        '**/node_modules/**',
      ],
    },
  },
});