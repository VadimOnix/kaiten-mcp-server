import { describe, it, expect, vi } from 'vitest';
import { listLanes } from '../../../src/tools/reference/list-lanes.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_list_lanes tool module', () => {
  it('returns lanes as JSON', async () => {
    const lanes = [{ id: 200, title: 'High Priority' }];
    const getLanes = vi.fn().mockResolvedValue(lanes);
    const res = await listLanes.run(
      { board_id: 10 },
      fakeCtx({ client: { getLanes } }),
    );
    expect(res.isError).toBeFalsy();
    expect(getLanes).toHaveBeenCalledWith(10, undefined);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual(lanes);
  });

  it('returns empty array when board has no lanes', async () => {
    const getLanes = vi.fn().mockResolvedValue([]);
    const res = await listLanes.run(
      { board_id: 10 },
      fakeCtx({ client: { getLanes } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const res = await listLanes.run(
      { board_id: 10 },
      fakeCtx({ client: { getLanes: vi.fn().mockRejectedValue(new Error('boom')) } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await listLanes.run({ board_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(listLanes.name).toBe('kaiten_list_lanes');
    expect(listLanes.annotations.readOnly).toBe(true);
    expect(listLanes.description.length).toBeGreaterThan(0);
  });
});
