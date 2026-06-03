import { describe, it, expect } from 'vitest';
import { config, redactSecrets } from '../src/config';

// Token configured in vitest.config.ts: 'test-token-0123456789-ABCDEF'
const TOKEN = 'test-token-0123456789-ABCDEF';

describe('config loading', () => {
  it('parses the injected test environment', () => {
    expect(config.KAITEN_API_URL).toBe('https://test.kaiten.ru/api/latest');
    expect(config.KAITEN_DEFAULT_SPACE_ID).toBe(42);
    expect(config.KAITEN_CACHE_TTL_SECONDS).toBe(300);
  });
});

describe('redactSecrets', () => {
  it('redacts the full API token wherever it appears', () => {
    const out = redactSecrets(`calling api with token ${TOKEN} done`);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('***REDACTED_TOKEN***');
  });

  it('redacts a Bearer authorization header', () => {
    const out = redactSecrets('Authorization: Bearer some.jwt-like_value');
    expect(out).toBe('Authorization: Bearer ***REDACTED_TOKEN***');
  });

  it('leaves text without secrets unchanged', () => {
    expect(redactSecrets('nothing sensitive here')).toBe('nothing sensitive here');
  });

  it('handles empty input safely', () => {
    expect(redactSecrets('')).toBe('');
  });
});
