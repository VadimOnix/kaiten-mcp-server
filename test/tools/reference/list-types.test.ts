import { describe, it, expect, vi } from 'vitest';
import { listTypes } from '../../../src/tools/reference/list-types.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_list_types tool module', () => {
  it('returns types as JSON', async () => {
    const types = [{ id: 300, name: 'Bug' }];
    const getTypes = vi.fn().mockResolvedValue(types);
    const res = await listTypes.run(
      { board_id: 10 },
      fakeCtx({ client: { getTypes } }),
    );
    expect(res.isError).toBeFalsy();
    expect(getTypes).toHaveBeenCalledWith(10, undefined);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual(types);
  });

  it('returns empty array when board has no types', async () => {
    const getTypes = vi.fn().mockResolvedValue([]);
    const res = await listTypes.run(
      { board_id: 10 },
      fakeCtx({ client: { getTypes } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const res = await listTypes.run(
      { board_id: 10 },
      fakeCtx({ client: { getTypes: vi.fn().mockRejectedValue(new Error('boom')) } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await listTypes.run({ board_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(listTypes.name).toBe('kaiten_list_types');
    expect(listTypes.annotations.readOnly).toBe(true);
    expect(listTypes.description.length).toBeGreaterThan(0);
  });
});
