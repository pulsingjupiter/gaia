/**
 * slugify — canonical kebab-case slug for both agent ids and skill slugs.
 *
 * Rules (matches existing inline implementations across the codebase):
 *   - lowercase
 *   - alphanumeric + hyphen only
 *   - collapsed hyphens; no leading/trailing hyphen
 *   - capped at 48 chars (matches the cap used by /api/employees POST)
 *
 * Use this in any new code touching slugs; the few legacy implementations
 * inline elsewhere produce equivalent output.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
}
