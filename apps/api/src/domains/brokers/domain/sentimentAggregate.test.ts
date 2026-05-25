/**
 * Unit tests for `aggregateSentiment` — the pure helper extracted from
 * the broker detail route. Every branch the helper documents is
 * exercised here so the broker route handler no longer needs an
 * integration-test seam for sentiment counts.
 */

import { describe, expect, it } from 'vitest';

import { aggregateSentiment } from './sentimentAggregate.js';

describe('aggregateSentiment', () => {
  it('returns zeroes for an empty input', () => {
    expect(aggregateSentiment([])).toEqual({ positive: 0, neutral: 0, negative: 0 });
  });

  it('counts a single POSITIVE review', () => {
    expect(aggregateSentiment([{ sentiment: 'POSITIVE' }])).toEqual({
      positive: 1,
      neutral: 0,
      negative: 0,
    });
  });

  it('counts a single NEUTRAL review', () => {
    expect(aggregateSentiment([{ sentiment: 'NEUTRAL' }])).toEqual({
      positive: 0,
      neutral: 1,
      negative: 0,
    });
  });

  it('counts a single NEGATIVE review', () => {
    expect(aggregateSentiment([{ sentiment: 'NEGATIVE' }])).toEqual({
      positive: 0,
      neutral: 0,
      negative: 1,
    });
  });

  it('counts mixed sentiments correctly', () => {
    const reviews = [
      { sentiment: 'POSITIVE' },
      { sentiment: 'POSITIVE' },
      { sentiment: 'POSITIVE' },
      { sentiment: 'NEUTRAL' },
      { sentiment: 'NEGATIVE' },
      { sentiment: 'NEGATIVE' },
    ];
    expect(aggregateSentiment(reviews)).toEqual({ positive: 3, neutral: 1, negative: 2 });
  });

  it('excludes null sentiment rows from every bucket (ADR-0028 D7 pre-backfill window)', () => {
    const reviews = [
      { sentiment: 'POSITIVE' },
      { sentiment: null },
      { sentiment: null },
      { sentiment: 'NEGATIVE' },
    ];
    const result = aggregateSentiment(reviews);
    expect(result).toEqual({ positive: 1, neutral: 0, negative: 1 });
    expect(result.positive + result.neutral + result.negative).toBe(2);
  });

  it('excludes unknown sentiment strings defensively', () => {
    const reviews = [
      { sentiment: 'POSITIVE' },
      { sentiment: 'UNKNOWN_FUTURE_VALUE' },
      { sentiment: '' },
      { sentiment: 'positive' },
    ];
    expect(aggregateSentiment(reviews)).toEqual({ positive: 1, neutral: 0, negative: 0 });
  });

  it('handles all-null input by returning zeroes', () => {
    expect(
      aggregateSentiment([{ sentiment: null }, { sentiment: null }, { sentiment: null }]),
    ).toEqual({ positive: 0, neutral: 0, negative: 0 });
  });

  it('treats the input as read-only and does not mutate it', () => {
    const reviews = [{ sentiment: 'POSITIVE' }, { sentiment: 'NEUTRAL' }];
    const snapshot = JSON.parse(JSON.stringify(reviews)) as typeof reviews;
    aggregateSentiment(reviews);
    expect(reviews).toEqual(snapshot);
  });
});
