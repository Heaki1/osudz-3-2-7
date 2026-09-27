/**
 * Parse a positive PostgreSQL INTEGER-compatible value.
 *
 * PostgreSQL INTEGER is signed 32-bit: 1..2147483647.
 * Reject anything outside that range before it reaches a query.
 */
export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && value <= 2147483647
      ? value
      : null;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) &&
    parsed > 0 &&
    parsed <= 2147483647
    ? parsed
    : null;
}
/**
 * Parse a positive JavaScript-safe integer.
 *
 * Use this for PostgreSQL BIGINT values that are represented as numbers in
 * application code. This intentionally does not impose PostgreSQL INTEGER's
 * 2,147,483,647 limit.
 */
export function parsePositiveSafeInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
