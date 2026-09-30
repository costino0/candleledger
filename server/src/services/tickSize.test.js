import { describe, expect, it } from 'vitest';
import { isMultipleOfTickSize } from './tickSize.js';

describe('isMultipleOfTickSize', () => {
  it.each(['18000', '18000.00', '18000.25', '18000.50', '18000.75', '0.25'])(
    'accepts %s with a 0.25 tick',
    (price) => {
      expect(isMultipleOfTickSize(price, '0.25')).toBe(true);
    },
  );

  it.each(['18000.10', '18000.01', '18000.99', '0.1'])('rejects %s with a 0.25 tick', (price) => {
    expect(isMultipleOfTickSize(price, '0.25')).toBe(false);
  });

  it('avoids floating-point error (0.3 % 0.1 is 0.0999… with numbers)', () => {
    expect(0.3 % 0.1).not.toBe(0);

    expect(isMultipleOfTickSize('0.30', '0.10')).toBe(true);
    expect(isMultipleOfTickSize('0.3', '0.1')).toBe(true);
    expect(isMultipleOfTickSize('18000.10', '0.10')).toBe(true);
  });

  it('works with a four-decimal tick size', () => {
    expect(isMultipleOfTickSize('1.0050', '0.0025')).toBe(true);
    expect(isMultipleOfTickSize('1.0051', '0.0025')).toBe(false);
  });

  it('works with a whole-number tick size', () => {
    expect(isMultipleOfTickSize('18000', '5')).toBe(true);
    expect(isMultipleOfTickSize('18002', '5')).toBe(false);
  });

  it.each(['0', '0.00', '-0.25'])('rejects tick size %s', (tickSize) => {
    expect(() => isMultipleOfTickSize('18000.00', tickSize)).toThrow(RangeError);
  });
});
