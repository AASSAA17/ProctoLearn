export const PASSWORD_HINT = 'Кемінде 6 таңба, 2 цифр және 2 арнайы таңба; ең көбі 72 UTF-8 байт.';
export function analyzePassword(password: string) {
  const digits = (password.match(/\d/g) ?? []).length;
  const specials = (password.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) ?? []).length;
  const bytes = new TextEncoder().encode(password).length;
  const checks = { length: Array.from(password).length >= 6, digits: digits >= 2, specials: specials >= 2, bytes: bytes <= 72, characters: !/[\n\r\u2028\u2029]/.test(password) };
  return { checks, digits, specials, bytes, score: [checks.length, checks.digits, checks.specials].filter(Boolean).length, valid: Object.values(checks).every(Boolean) };
}
