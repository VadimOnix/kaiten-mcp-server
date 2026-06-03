import { describe, it, expect } from 'vitest';
import { config, redactSecrets, EnvSchema } from '../src/config';

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

// Minimal valid env for EnvSchema.safeParse() — only required fields; rest use defaults.
const minValidEnv = {
  KAITEN_API_URL: 'https://test.kaiten.ru/api/latest',
  KAITEN_API_TOKEN: 'test-token-0123456789-ABCDEF',
};

describe('KAITEN_INSECURE_SSL env parsing', () => {
  it('defaults to false when the variable is absent', () => {
    const result = EnvSchema.safeParse(minValidEnv);
    expect(result.success).toBe(true);
    expect(result.data?.KAITEN_INSECURE_SSL).toBe(false);
  });

  it("is true only for the exact string 'true'", () => {
    const result = EnvSchema.safeParse({ ...minValidEnv, KAITEN_INSECURE_SSL: 'true' });
    expect(result.success).toBe(true);
    expect(result.data?.KAITEN_INSECURE_SSL).toBe(true);
  });

  it("is false for 'True' (wrong case)", () => {
    const result = EnvSchema.safeParse({ ...minValidEnv, KAITEN_INSECURE_SSL: 'True' });
    expect(result.success).toBe(true);
    expect(result.data?.KAITEN_INSECURE_SSL).toBe(false);
  });

  it("is false for '1'", () => {
    const result = EnvSchema.safeParse({ ...minValidEnv, KAITEN_INSECURE_SSL: '1' });
    expect(result.success).toBe(true);
    expect(result.data?.KAITEN_INSECURE_SSL).toBe(false);
  });

  it("is false for 'yes'", () => {
    const result = EnvSchema.safeParse({ ...minValidEnv, KAITEN_INSECURE_SSL: 'yes' });
    expect(result.success).toBe(true);
    expect(result.data?.KAITEN_INSECURE_SSL).toBe(false);
  });

  it("is false for empty string ''", () => {
    const result = EnvSchema.safeParse({ ...minValidEnv, KAITEN_INSECURE_SSL: '' });
    expect(result.success).toBe(true);
    expect(result.data?.KAITEN_INSECURE_SSL).toBe(false);
  });
});
