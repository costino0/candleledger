import { describe, expect, it } from 'vitest';
import {
  EMPTY,
  formatDateTime,
  formatDecimal,
  formatMoney,
  formatPercent,
  outcomeClass,
} from './format.js';

describe('formatDecimal', () => {
  it('adds thousands separators to the integer part', () => {
    expect(formatDecimal('18000.25')).toBe('18,000.25');
    expect(formatDecimal('1234567.00')).toBe('1,234,567.00');
  });

  it('leaves short values and negative values readable', () => {
    expect(formatDecimal('10.25')).toBe('10.25');
    expect(formatDecimal('-4.50')).toBe('-4.50');
    expect(formatDecimal('-1250.00')).toBe('-1,250.00');
    expect(formatDecimal('0.00')).toBe('0.00');
  });

  it('shows null as a dash', () => {
    expect(formatDecimal(null)).toBe(EMPTY);
  });
});

describe('formatMoney', () => {
  it('formats positive, negative and zero amounts', () => {
    expect(formatMoney('38.52')).toBe('$38.52');
    expect(formatMoney('-25.50')).toBe('-$25.50');
    expect(formatMoney('0.00')).toBe('$0.00');
    expect(formatMoney('1234.00')).toBe('$1,234.00');
  });

  it('keeps every digit of a value beyond JavaScript number precision', () => {
    // Number('12345678901234567.89') would come back as 12345678901234568.
    expect(formatMoney('12345678901234567.89')).toBe('$12,345,678,901,234,567.89');
    expect(formatMoney('-12345678901234567.89')).toBe('-$12,345,678,901,234,567.89');
  });

  it('shows null as a dash', () => {
    expect(formatMoney(null)).toBe(EMPTY);
  });
});

describe('formatPercent', () => {
  it('appends a percent sign to the server value', () => {
    expect(formatPercent('50.00')).toBe('50.00%');
    expect(formatPercent('100.00')).toBe('100.00%');
  });

  it('shows null as a dash', () => {
    expect(formatPercent(null)).toBe(EMPTY);
  });
});

describe('formatDateTime', () => {
  // Tests run with TZ=UTC (see vite.config.js); browsers use their own local time zone.
  it('formats a UTC timestamp as a readable local date and time', () => {
    expect(formatDateTime('2026-09-30T14:30:00.000Z')).toMatch(/^Sep 30, 2026, 2:30\sPM$/);
  });

  it('shows null as a dash', () => {
    expect(formatDateTime(null)).toBe(EMPTY);
  });
});

describe('outcomeClass', () => {
  it('reads the sign from the string', () => {
    expect(outcomeClass('38.52')).toBe('outcome-positive');
    expect(outcomeClass('-25.50')).toBe('outcome-negative');
  });

  it('treats zero as neither a win nor a loss', () => {
    expect(outcomeClass('0.00')).toBe('outcome-zero');
    expect(outcomeClass('-0.00')).toBe('outcome-zero');
  });

  it('gives no class to null', () => {
    expect(outcomeClass(null)).toBeUndefined();
  });
});
