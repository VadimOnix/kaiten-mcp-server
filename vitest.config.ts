import { defineConfig } from 'vitest/config';

// The Kaiten server validates required ENV vars at import time (src/config.ts
// calls process.exit(1) on invalid config). Provide a valid test configuration
// here so any module that transitively imports ./config.ts can load cleanly.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      KAITEN_API_URL: 'https://test.kaiten.ru/api/latest',
      KAITEN_API_TOKEN: 'test-token-0123456789-ABCDEF',
      KAITEN_DEFAULT_SPACE_ID: '42',
      KAITEN_CACHE_TTL_SECONDS: '300',
      KAITEN_LOG_ENABLED: 'false',
      KAITEN_LOG_LEVEL: 'error',
    },
  },
});
