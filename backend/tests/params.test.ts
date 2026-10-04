import { describe, expect, it } from 'vitest';
import { param } from '../src/utils/params';

describe('param', () => {
  it('returns the string as-is when given a string', () => {
    expect(param('hello')).toBe('hello');
    expect(param('')).toBe('');
  });

  it('returns the first element when given an array', () => {
    expect(param(['first', 'second'])).toBe('first');
  });

  it('returns an empty string when given an empty array', () => {
    expect(param([])).toBe('');
  });

  it('returns an empty string when given an array whose first element is undefined', () => {
    expect(param([undefined] as unknown as string[])).toBe('');
  });

  it('returns an empty string when given undefined', () => {
    expect(param(undefined)).toBe('');
  });
});