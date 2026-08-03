/**
 * Unit tests for `ListNewsUseCase`.
 *
 * Coverage:
 *   - Maps domain records to DTOs (publishedAt -> ISO string)
 *   - Clamps limit to MAX_LIMIT and floors at 1; defaults when absent
 *   - Fetches limit + 1 to detect a further page and sets nextCursor
 *   - Returns nextCursor = null when there is no further page
 *   - Forwards the optional cursor + symbol seam to the repository
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DEFAULT_LIMIT, ListNewsUseCase, MAX_LIMIT } from './ListNewsUseCase.js';

import type { INewsRepository } from '../domain/INewsRepository.js';
import type { NewsItemRecord } from '../domain/NewsItemEntity.js';

const fixture = (overrides: Partial<NewsItemRecord> = {}): NewsItemRecord => ({
  id: 'news_0001',
  title: '恒指高開',
  sourceName: '香港電台 財經',
  sourceUrl: 'https://example.com/a',
  publishedAt: new Date('2026-07-01T08:00:00.000Z'),
  lang: 'zh-Hant',
  imageUrl: null,
  ...overrides,
});

describe('ListNewsUseCase', () => {
  let repo: MockProxy<INewsRepository>;
  let useCase: ListNewsUseCase;

  beforeEach(() => {
    repo = mock<INewsRepository>();
    useCase = new ListNewsUseCase(repo);
  });

  it('maps records to DTOs with ISO publishedAt', async () => {
    repo.list.mockResolvedValue([fixture()]);

    const result = await useCase.execute({ limit: 10 });

    expect(result.items).toEqual([
      {
        id: 'news_0001',
        title: '恒指高開',
        sourceName: '香港電台 財經',
        sourceUrl: 'https://example.com/a',
        publishedAt: '2026-07-01T08:00:00.000Z',
        lang: 'zh-Hant',
        imageUrl: null,
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('fetches limit + 1 and defaults the limit when absent', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({});

    expect(repo.list).toHaveBeenCalledWith({ limit: DEFAULT_LIMIT + 1 });
  });

  it('clamps an over-large limit to MAX_LIMIT (and still fetches +1)', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({ limit: 999 });

    expect(repo.list).toHaveBeenCalledWith({ limit: MAX_LIMIT + 1 });
  });

  it('floors a non-positive limit at 1', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({ limit: 0 });

    expect(repo.list).toHaveBeenCalledWith({ limit: 2 });
  });

  it('trims the extra row and sets nextCursor when a further page exists', async () => {
    const rows = [
      fixture({ id: 'a' }),
      fixture({ id: 'b' }),
      fixture({ id: 'c' }), // the +1 sentinel
    ];
    repo.list.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 2 });

    expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.nextCursor).toBe('b');
  });

  it('forwards cursor and symbol seam to the repository', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({ limit: 5, cursor: 'cur_1', symbol: '00005' });

    expect(repo.list).toHaveBeenCalledWith({ limit: 6, cursor: 'cur_1', symbol: '00005' });
  });
});
