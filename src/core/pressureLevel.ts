/**
 * Pressure level classification for context window usage.
 *
 * Thresholds are locked per constitution Section 10.1 and must not be changed
 * without a corresponding constitution update.
 */

/**
 * Discrete pressure levels mapped from a percentage of context window usage.
 */
export type PressureLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH' | 'CRITICAL';

/**
 * Maps a context usage percentage (0-100 inclusive) to a {@link PressureLevel}.
 *
 * Thresholds (Section 10.1):
 *   - 0-30   → LOW
 *   - 31-55  → MEDIUM
 *   - 56-75  → HIGH
 *   - 76-90  → VERY HIGH
 *   - 91-100 → CRITICAL
 *
 * @param percent - An integer in the range 0..100 inclusive.
 * @throws {RangeError} If the value is outside 0-100 or is not a finite integer.
 */
export function pressureLevelFor(percent: number): PressureLevel {
  if (!Number.isFinite(percent) || !Number.isInteger(percent)) {
    throw new RangeError(
      `Context pressure percentage must be a finite integer; got ${percent}`
    );
  }
  if (percent < 0 || percent > 100) {
    throw new RangeError(
      `Context pressure percentage must be 0-100 inclusive; got ${percent}`
    );
  }

  if (percent <= 30) {
    return 'LOW';
  }
  if (percent <= 55) {
    return 'MEDIUM';
  }
  if (percent <= 75) {
    return 'HIGH';
  }
  if (percent <= 90) {
    return 'VERY HIGH';
  }
  return 'CRITICAL';
}

/**
 * Parses a raw string from user input into a validated integer percentage.
 *
 * Accepts an optional trailing `%` character and surrounding whitespace.
 * Throws {@link RangeError} if the result is not a 0-100 integer.
 *
 * @param input - Raw string from an InputBox (e.g. `"45"`, `"45%"`).
 * @returns The parsed integer percentage.
 * @throws {RangeError} If the input cannot be parsed or is out of range.
 */
export function parsePressurePercent(input: string): number {
  const trimmed = input.trim().replace(/%$/, '');
  const parsed = parseInt(trimmed, 10);

  if (
    !Number.isFinite(parsed) ||
    isNaN(parsed) ||
    String(parsed) !== trimmed
  ) {
    throw new RangeError(
      `"${input}" is not a valid integer percentage. Enter a whole number from 0 to 100.`
    );
  }

  if (parsed < 0 || parsed > 100) {
    throw new RangeError(
      `Percentage must be 0-100 inclusive; got ${parsed}.`
    );
  }

  return parsed;
}
