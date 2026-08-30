import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'tests/e2e/**',
      '.next/**',
      '.open-next/**',
      'node_modules/**',
      '**/node_modules/**',
    ],
    setupFiles: ['tests/setup.ts'],
    environmentMatchGlobs: [
      ['tests/unit/components/**', 'jsdom'],
      ['tests/unit/ui/**', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**', 'worker/**', 'app/api/**', 'components/**'],
      exclude: [
        'node_modules/',
        'tests/',
        'lib/generated/**',
        '.next/**',
        '.open-next/**',
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
