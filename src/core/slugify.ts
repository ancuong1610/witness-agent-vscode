/**
 * Pure ASCII slug generation — no VS Code dependencies.
 */

/**
 * Converts a free-text title into a filesystem-safe ASCII slug.
 *
 * - Lowercases the input.
 * - Replaces any run of non-alphanumeric ASCII characters with a single hyphen.
 * - Trims leading/trailing hyphens.
 * - Truncates to `maxLength` characters (default 50), trimming trailing hyphens after truncation.
 * - If the result is empty (input had no alphanumeric ASCII characters), returns `'untitled'`.
 *
 * Note: intentionally ASCII-only for v0.1. Non-ASCII characters (e.g. Vietnamese diacritics, CJK)
 * are replaced by hyphens. The original title is preserved inside the ADR document.
 *
 * @param input - Raw title text from user input.
 * @param maxLength - Maximum slug length. Defaults to 50.
 */
export function slugify(input: string, maxLength: number = 50): string {
  // Lowercase and replace any run of non-alphanumeric ASCII chars with a hyphen.
  let slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  // Trim leading/trailing hyphens.
  slug = slug.replace(/^-+|-+$/g, '');

  // Truncate to maxLength.
  if (slug.length > maxLength) {
    slug = slug.slice(0, maxLength);
    // Trim trailing hyphens that may have been exposed by truncation.
    slug = slug.replace(/-+$/g, '');
  }

  return slug.length > 0 ? slug : 'untitled';
}
