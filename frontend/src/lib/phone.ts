/** Pakistan mobile: 03XXXXXXXXX — exactly 11 digits, starts with 03 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeMobileInput(value: string): string {
  const digits = digitsOnly(value);
  // Allow typing; hard-cap at 11 for local mobile
  if (digits.startsWith('92') && digits.length > 2) {
    // +92 3XX… → convert toward 03… while typing
    const local = `0${digits.slice(2)}`;
    return local.slice(0, 11);
  }
  return digits.slice(0, 11);
}

export function isValidPakistanMobile(phone: string): boolean {
  const digits = digitsOnly(phone);
  return /^03\d{9}$/.test(digits) && digits.length === 11;
}

export function formatMobileDisplay(phone: string): string {
  const d = digitsOnly(phone).slice(0, 11);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

export function mobileValidationMessage(phone: string): string | null {
  const digits = digitsOnly(phone);
  if (!digits) return 'Contact number is required and cannot be empty.';
  if (digits.length > 11) return 'Contact number cannot be longer than 11 digits.';
  if (digits.length < 11) return 'Enter a complete 11-digit contact number (e.g. 03001234567).';
  if (!digits.startsWith('03')) return 'Contact number must start with 03.';
  if (!isValidPakistanMobile(digits)) return 'Enter a valid Pakistani contact number.';
  return null;
}
