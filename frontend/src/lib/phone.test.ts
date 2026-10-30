import { describe, expect, it } from 'vitest';
import {
  digitsOnly,
  formatMobileDisplay,
  isValidPakistanMobile,
  mobileValidationMessage,
  normalizeMobileInput,
} from './phone';

describe('phone', () => {
  it('strips non-digits and converts a +92 prefix while typing', () => {
    expect(digitsOnly('+92 300-1234567')).toBe('923001234567');
    expect(normalizeMobileInput('+923001234567')).toBe('03001234567');
    expect(normalizeMobileInput('0300123456789')).toBe('03001234567');
  });

  it('accepts an 11-digit 03 number and explains the other cases', () => {
    expect(isValidPakistanMobile('0300 123 4567')).toBe(true);
    expect(isValidPakistanMobile('04001234567')).toBe(false);
    expect(mobileValidationMessage('')).toMatch(/required/i);
    expect(mobileValidationMessage('0300')).toMatch(/11-digit/);
    expect(mobileValidationMessage('04001234567')).toMatch(/start with 03/);
    expect(mobileValidationMessage('03001234567')).toBeNull();
  });

  it('groups a display number as 4-3-4', () => {
    expect(formatMobileDisplay('03001234567')).toBe('0300 123 4567');
    expect(formatMobileDisplay('0300')).toBe('0300');
  });
});
