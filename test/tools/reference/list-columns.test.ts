import { describe, it, expect, vi } from 'vitest';
import { listColumns } from '../../../src/tools/reference/list-columns.js';

const fakeCtx = (over: Partial<any> = {}) =>
  ({
    client: {},
    cache: {},
    config: { KAITEN_DEFAULT_SPACE_ID: 42, KAITEN_API_URL: 'https://x.kaiten.ru/api/latest' },
    log: { warning: () => {}, info: () => {}, error: () => {}, debug: () => {} },
    signal: undefined,
    ...over,
  }) as any;

describe('kaiten_list_columns tool module', () => {
  it('returns columns as JSON', async () => {
    const columns = [{ id: 100, title: 'Backlog' }];
    const getColumns = vi.fn().mockResolvedValue(columns);
    const res = await listColumns.run(
      { board_id: 10 },
      fakeCtx({ client: { getColumns } }),
    );
    expect(res.isError).toBeFalsy();
    expect(getColumns).toHaveBeenCalledWith(10, undefined);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual(columns);
  });

  it('returns empty array when board has no columns', async () => {
    const getColumns = vi.fn().mockResolvedValue([]);
    const res = await listColumns.run(
      { board_id: 10 },
      fakeCtx({ client: { getColumns } }),
    );
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual([]);
  });

  it('maps a thrown error to an error result', async () => {
    const res = await listColumns.run(
      { board_id: 10 },
      fakeCtx({ client: { getColumns: vi.fn().mockRejectedValue(new Error('boom')) } }),
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('UNKNOWN_ERROR');
  });

  it('rejects invalid args via the schema', async () => {
    const res = await listColumns.run({ board_id: -1 }, fakeCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('has expected metadata', () => {
    expect(listColumns.name).toBe('kaiten_list_columns');
    expect(listColumns.annotations.readOnly).toBe(true);
    expect(listColumns.description.length).toBeGreaterThan(0);
  });
});
