// Escapes Postgres LIKE/ILIKE wildcard metacharacters (%, _, \) so user-supplied
// search text is matched literally instead of being interpreted as a pattern.
export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`)
}
